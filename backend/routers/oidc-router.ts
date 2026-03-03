import { Router } from "../router";
import express, { Express, Router as ExpressRouter, Request } from "express";
import { HomelabServer } from "../homelab-server";
import { Settings } from "../settings";
import { log } from "../log";
import { R } from "redbean-node";
import User from "../models/user";
import { generatePasswordHash } from "../password-hash";
import { genSecret } from "../../common/util-common";
import jwt from "jsonwebtoken";
import crypto from "crypto";

interface OIDCDiscovery {
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint?: string;
    issuer: string;
}

interface OIDCTokenResponse {
    access_token: string;
    id_token: string;
    token_type: string;
    expires_in?: number;
    refresh_token?: string;
}

let discoveryCache: { config: OIDCDiscovery; timestamp: number } | null = null;
const DISCOVERY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch OIDC discovery document from the issuer
 */
export async function discoverOIDC(issuerUrl: string): Promise<OIDCDiscovery> {
    // Use cache if available and fresh
    if (discoveryCache && (Date.now() - discoveryCache.timestamp) < DISCOVERY_CACHE_TTL) {
        return discoveryCache.config;
    }

    const url = issuerUrl.replace(/\/+$/, "") + "/.well-known/openid-configuration";
    log.info("oidc", `Discovering OIDC configuration from ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch OIDC discovery document: ${response.status} ${response.statusText}`);
    }

    const config = await response.json() as OIDCDiscovery;

    if (!config.authorization_endpoint || !config.token_endpoint) {
        throw new Error("Invalid OIDC discovery document: missing required endpoints");
    }

    discoveryCache = {
        config,
        timestamp: Date.now()
    };
    return config;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
    tokenEndpoint: string,
    code: string,
    redirectUri: string,
    clientId: string,
    clientSecret: string
): Promise<OIDCTokenResponse> {
    const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
    });

    const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${errorBody}`);
    }

    return await response.json() as OIDCTokenResponse;
}

/**
 * Build the OIDC callback redirect URI from the request
 */
export function getRedirectUri(req: Request): string {
    const protocol = req.headers["x-forwarded-proto"] || req.protocol;
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    return `${protocol}://${host}/auth/oidc/callback`;
}

/**
 * Clear the discovery cache (useful for testing and when settings change)
 */
export function clearDiscoveryCache(): void {
    discoveryCache = null;
}

export class OidcRouter extends Router {
    create(app: Express, server: HomelabServer): ExpressRouter {
        const router = express.Router();

        // Initiate OIDC login - redirects user to the identity provider
        router.get("/auth/oidc/login", async (req, res) => {
            try {
                const enabled = await Settings.get("oidcEnabled");
                if (!enabled) {
                    res.status(400).send("OIDC SSO is not enabled.");
                    return;
                }

                const issuerUrl = await Settings.get("oidcIssuerUrl") as string;
                const clientId = await Settings.get("oidcClientId") as string;
                const scopes = (await Settings.get("oidcScopes") as string) || "openid profile email";

                if (!issuerUrl || !clientId) {
                    res.status(500).send("OIDC is not properly configured.");
                    return;
                }

                const oidcConfig = await discoverOIDC(issuerUrl);
                const redirectUri = getRedirectUri(req);

                // Create a signed state token to prevent CSRF
                const statePayload = {
                    nonce: crypto.randomBytes(16).toString("hex"),
                    redirectUri,
                };
                const state = jwt.sign(statePayload, server.jwtSecret, { expiresIn: "5m" });

                const params = new URLSearchParams({
                    response_type: "code",
                    client_id: clientId,
                    redirect_uri: redirectUri,
                    scope: scopes,
                    state: state,
                });

                log.info("oidc", "Redirecting to OIDC provider for authentication");
                res.redirect(`${oidcConfig.authorization_endpoint}?${params.toString()}`);
            } catch (e) {
                log.error("oidc", e);
                res.redirect("/?oidcError=login_failed");
            }
        });

        // OIDC callback - handles the response from the identity provider
        router.get("/auth/oidc/callback", async (req, res) => {
            try {
                const { code, state, error } = req.query;
                // eslint-disable-next-line camelcase
                const errorDescription = req.query.error_description;

                // Handle provider errors
                if (error) {
                    log.error("oidc", `Provider error: ${error} - ${errorDescription}`);
                    res.redirect(`/?oidcError=${encodeURIComponent(String(errorDescription || error))}`);
                    return;
                }

                if (!code || !state) {
                    log.error("oidc", "Missing code or state in callback");
                    res.redirect("/?oidcError=missing_params");
                    return;
                }

                // Verify the state token
                let statePayload: { nonce: string; redirectUri: string };
                try {
                    statePayload = jwt.verify(String(state), server.jwtSecret) as { nonce: string; redirectUri: string };
                } catch {
                    log.error("oidc", "Invalid or expired state token");
                    res.redirect("/?oidcError=invalid_state");
                    return;
                }

                // Load OIDC settings
                const issuerUrl = await Settings.get("oidcIssuerUrl") as string;
                const clientId = await Settings.get("oidcClientId") as string;
                const clientSecret = await Settings.get("oidcClientSecret") as string;

                if (!issuerUrl || !clientId || !clientSecret) {
                    res.redirect("/?oidcError=not_configured");
                    return;
                }

                const oidcConfig = await discoverOIDC(issuerUrl);

                // Exchange authorization code for tokens
                const tokens = await exchangeCodeForTokens(
                    oidcConfig.token_endpoint,
                    String(code),
                    statePayload.redirectUri,
                    clientId,
                    clientSecret
                );

                // Decode the ID token to get user claims
                // Since we received the token directly from the token endpoint over TLS,
                // signature verification is not required per OpenID Connect Core 3.1.3.7
                const idTokenPayload = jwt.decode(tokens.id_token) as Record<string, unknown> | null;

                if (!idTokenPayload) {
                    log.error("oidc", "Failed to decode ID token");
                    res.redirect("/?oidcError=invalid_token");
                    return;
                }

                // Extract username from claims
                const usernameClaim = (await Settings.get("oidcUsernameClaim") as string) || "preferred_username";
                let username = idTokenPayload[usernameClaim] as string | undefined;

                // Fallback to email or sub if preferred claim is not available
                if (!username) {
                    username = (idTokenPayload.preferred_username || idTokenPayload.email || idTokenPayload.sub) as string | undefined;
                }

                if (!username) {
                    log.error("oidc", "No username found in ID token claims: " + JSON.stringify(Object.keys(idTokenPayload)));
                    res.redirect("/?oidcError=no_username");
                    return;
                }

                log.info("oidc", `OIDC login for username: ${username}`);

                // Find or create user
                let user = await R.findOne("user", " username = ? AND active = 1 ", [ username ]) as User | null;

                if (!user) {
                    const autoCreate = await Settings.get("oidcAutoCreateUsers");
                    if (!autoCreate) {
                        log.warn("oidc", `User ${username} not found and auto-create is disabled`);
                        res.redirect("/?oidcError=user_not_found");
                        return;
                    }

                    // Auto-create the user with a random password (they'll use OIDC to log in)
                    log.info("oidc", `Auto-creating user: ${username}`);
                    user = R.dispense("user") as User;
                    user.username = username;
                    user.password = generatePasswordHash(genSecret());
                    user.active = true;
                    await R.store(user);

                    // If this is the first user, mark setup as complete
                    server.needSetup = false;
                }

                // Create a JWT for the user (same as regular login)
                const token = User.createJWT(user, server.jwtSecret);

                log.info("oidc", `OIDC login successful for user: ${username}`);

                // Redirect to frontend with token
                res.redirect(`/?oidcToken=${encodeURIComponent(token)}`);
            } catch (e) {
                log.error("oidc", e);
                res.redirect("/?oidcError=callback_failed");
            }
        });

        return router;
    }
}
