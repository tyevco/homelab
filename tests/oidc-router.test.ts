import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverOIDC, exchangeCodeForTokens, getRedirectUri, clearDiscoveryCache } from "../backend/routers/oidc-router";

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        dispense: vi.fn(() => ({
            username: "",
            password: "",
            active: true,
        })),
        store: vi.fn(),
        findOne: vi.fn(),
    },
}));

// Mock password-hash
vi.mock("../backend/password-hash", () => ({
    generatePasswordHash: vi.fn((p: string) => `hashed_${p}`),
    shake256: vi.fn(() => "mock-shake"),
    SHAKE256_LENGTH: 16,
}));

// Mock settings
vi.mock("../backend/settings", () => ({
    Settings: {
        get: vi.fn().mockResolvedValue(null),
        getSettings: vi.fn().mockResolvedValue({}),
        setSettings: vi.fn().mockResolvedValue(undefined),
    },
}));

// Mock jsonwebtoken
vi.mock("jsonwebtoken", () => ({
    default: {
        sign: vi.fn(() => "mock-state-token"),
        verify: vi.fn(() => ({ nonce: "test-nonce",
            redirectUri: "http://localhost:5001/auth/oidc/callback" })),
        decode: vi.fn(() => ({
            sub: "user123",
            preferred_username: "testuser",
            email: "test@example.com",
        })),
    },
}));

// Mock User model
vi.mock("../backend/models/user", () => ({
    default: {
        createJWT: vi.fn(() => "mock-jwt-token"),
    },
    User: {
        createJWT: vi.fn(() => "mock-jwt-token"),
    },
}));

// Mock common utils (partially - keep real exports, only mock genSecret)
vi.mock("../common/util-common", async (importOriginal) => {
    const actual = await importOriginal() as Record<string, unknown>;
    return {
        ...actual,
        genSecret: vi.fn(() => "random-secret-password"),
    };
});

describe("OIDC Router Helpers", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        clearDiscoveryCache();
    });

    describe("discoverOIDC", () => {
        it("should fetch and return OIDC discovery document", async () => {
            const mockConfig = {
                authorization_endpoint: "https://idp.example.com/auth",
                token_endpoint: "https://idp.example.com/token",
                userinfo_endpoint: "https://idp.example.com/userinfo",
                issuer: "https://idp.example.com",
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockConfig),
            });

            const result = await discoverOIDC("https://idp.example.com");
            expect(result).toEqual(mockConfig);
            expect(fetch).toHaveBeenCalledWith("https://idp.example.com/.well-known/openid-configuration");
        });

        it("should strip trailing slashes from issuer URL", async () => {
            const mockConfig = {
                authorization_endpoint: "https://idp.example.com/auth",
                token_endpoint: "https://idp.example.com/token",
                issuer: "https://idp.example.com",
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockConfig),
            });

            await discoverOIDC("https://idp.example.com///");
            expect(fetch).toHaveBeenCalledWith("https://idp.example.com/.well-known/openid-configuration");
        });

        it("should cache discovery results", async () => {
            const mockConfig = {
                authorization_endpoint: "https://idp.example.com/auth",
                token_endpoint: "https://idp.example.com/token",
                issuer: "https://idp.example.com",
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockConfig),
            });

            await discoverOIDC("https://idp.example.com");
            await discoverOIDC("https://idp.example.com");

            // Should only fetch once due to caching
            expect(fetch).toHaveBeenCalledTimes(1);
        });

        it("should throw on HTTP error", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404,
                statusText: "Not Found",
            });

            await expect(discoverOIDC("https://bad.example.com")).rejects.toThrow("Failed to fetch OIDC discovery document");
        });

        it("should throw on invalid discovery document", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({ issuer: "https://idp.example.com" }),
            });

            await expect(discoverOIDC("https://idp.example.com")).rejects.toThrow("missing required endpoints");
        });
    });

    describe("exchangeCodeForTokens", () => {
        it("should exchange authorization code for tokens", async () => {
            const mockTokenResponse = {
                access_token: "access-token-123",
                id_token: "id-token-456",
                token_type: "Bearer",
                expires_in: 3600,
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockTokenResponse),
            });

            const result = await exchangeCodeForTokens(
                "https://idp.example.com/token",
                "auth-code-789",
                "http://localhost:5001/auth/oidc/callback",
                "client-id",
                "client-secret"
            );

            expect(result).toEqual(mockTokenResponse);
            expect(fetch).toHaveBeenCalledWith("https://idp.example.com/token", expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            }));

            // Verify the body contains the correct parameters
            const callArgs = vi.mocked(fetch).mock.calls[0];
            const body = (callArgs[1] as RequestInit).body as string;
            const params = new URLSearchParams(body);
            expect(params.get("grant_type")).toBe("authorization_code");
            expect(params.get("code")).toBe("auth-code-789");
            expect(params.get("client_id")).toBe("client-id");
            expect(params.get("client_secret")).toBe("client-secret");
        });

        it("should throw on token exchange failure", async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 400,
                text: vi.fn().mockResolvedValue("{\"error\":\"invalid_grant\"}"),
            });

            await expect(
                exchangeCodeForTokens(
                    "https://idp.example.com/token",
                    "bad-code",
                    "http://localhost:5001/auth/oidc/callback",
                    "client-id",
                    "client-secret"
                )
            ).rejects.toThrow("Token exchange failed");
        });
    });

    describe("getRedirectUri", () => {
        it("should build redirect URI from request headers", () => {
            const mockReq = {
                protocol: "https",
                headers: {
                    host: "homelab.example.com",
                },
            } as never;

            const uri = getRedirectUri(mockReq);
            expect(uri).toBe("https://homelab.example.com/auth/oidc/callback");
        });

        it("should use x-forwarded-proto and x-forwarded-host headers", () => {
            const mockReq = {
                protocol: "http",
                headers: {
                    host: "localhost:5001",
                    "x-forwarded-proto": "https",
                    "x-forwarded-host": "homelab.example.com",
                },
            } as never;

            const uri = getRedirectUri(mockReq);
            expect(uri).toBe("https://homelab.example.com/auth/oidc/callback");
        });

        it("should fallback to request protocol and host header", () => {
            const mockReq = {
                protocol: "http",
                headers: {
                    host: "localhost:5001",
                },
            } as never;

            const uri = getRedirectUri(mockReq);
            expect(uri).toBe("http://localhost:5001/auth/oidc/callback");
        });
    });

    describe("clearDiscoveryCache", () => {
        it("should clear cached discovery config", async () => {
            const mockConfig = {
                authorization_endpoint: "https://idp.example.com/auth",
                token_endpoint: "https://idp.example.com/token",
                issuer: "https://idp.example.com",
            };

            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue(mockConfig),
            });

            await discoverOIDC("https://idp.example.com");
            expect(fetch).toHaveBeenCalledTimes(1);

            clearDiscoveryCache();

            await discoverOIDC("https://idp.example.com");
            expect(fetch).toHaveBeenCalledTimes(2);
        });
    });
});
