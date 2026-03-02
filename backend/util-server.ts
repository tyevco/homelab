import { Socket } from "socket.io";
import { Terminal } from "./terminal";

import { log } from "./log";
import { ERROR_TYPE_VALIDATION } from "../common/util-common";
import { R } from "redbean-node";
import { verifyPassword } from "./password-hash";
import fs from "fs";
import { AgentManager } from "./agent-manager";
import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import { ApiToken } from "./models/api_token";

export interface JWTDecoded {
    username : string;
    h? : string;
}

export interface HomelabSocket extends Socket {
    userID: number;
    consoleTerminal? : Terminal;
    instanceManager : AgentManager;
    endpoint : string;
    emitAgent : (eventName : string, ...args : unknown[]) => void;
}

// For command line arguments, so they are nullable
export interface Arguments {
    sslKey? : string;
    sslCert? : string;
    sslKeyPassphrase? : string;
    port? : number;
    hostname? : string;
    dataDir? : string;
    stacksDir? : string;
    enableConsole? : boolean;
}

// Some config values are required
export interface Config extends Arguments {
    dataDir : string;
    stacksDir : string;
}

export function checkLogin(socket : HomelabSocket) {
    if (!socket.userID) {
        throw new Error("You are not logged in.");
    }
}

export class ValidationError extends Error {
    constructor(message : string) {
        super(message);
    }
}

export function callbackError(error : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }

    if (error instanceof ValidationError) {
        callback({
            ok: false,
            type: ERROR_TYPE_VALIDATION,
            msg: error.message,
            msgi18n: true,
        });
    } else if (error instanceof Error) {
        callback({
            ok: false,
            msg: error.message,
            msgi18n: true,
        });
    } else {
        log.debug("console", "Unknown error: " + error);
    }
}

export function callbackResult(result : unknown, callback : unknown) {
    if (typeof(callback) !== "function") {
        log.error("console", "Callback is not a function");
        return;
    }
    callback(result);
}

export async function doubleCheckPassword(socket : HomelabSocket, currentPassword : unknown) {
    if (typeof currentPassword !== "string") {
        throw new Error("Wrong data type?");
    }

    let user = await R.findOne("user", " id = ? AND active = 1 ", [
        socket.userID,
    ]);

    if (!user || !verifyPassword(currentPassword, user.password)) {
        throw new Error("Incorrect current password");
    }

    return user;
}

export function fileExists(file : string) {
    return fs.promises.access(file, fs.constants.F_OK)
        .then(() => true)
        .catch(() => false);
}

export function createApiAuthMiddleware(jwtSecret : string) {
    return async (req : Request, res : Response, next : NextFunction) => {
        try {
            const authHeader = req.headers["authorization"];
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                log.warn("api-auth", `${req.method} ${req.originalUrl} - Missing or invalid Authorization header`);
                res.status(401).json({ message: "Missing or invalid Authorization header" });
                return;
            }

            const token = authHeader.slice(7);
            const tokenPreview = token.substring(0, 10);

            // Try JWT first
            try {
                const decoded = jwt.verify(token, jwtSecret) as JWTDecoded;
                const user = await R.findOne("user", " username = ? AND active = 1 ", [ decoded.username ]);
                if (user) {
                    log.info("api-auth", `${req.method} ${req.originalUrl} - Authenticated via JWT (user: ${decoded.username})`);
                    next();
                    return;
                }
                log.warn("api-auth", `${req.method} ${req.originalUrl} - JWT valid but user not found: ${decoded.username}`);
            } catch {
                log.debug("api-auth", `${req.method} ${req.originalUrl} - JWT verification failed for token ${tokenPreview}..., trying API token`);
            }

            // Fallback: check API tokens
            const activeTokens = (await R.find("api_token", " active ") || []) as ApiToken[];
            log.debug("api-auth", `Found ${activeTokens.length} active API token(s)`);
            for (const apiToken of activeTokens) {
                if (typeof apiToken.token_hash !== "string") {
                    log.warn("api-auth", `API token id=${apiToken.id} has invalid token_hash type: ${typeof apiToken.token_hash}`);
                    continue;
                }
                if (verifyPassword(token, apiToken.token_hash)) {
                    const user = await R.findOne("user", " id = ? AND active = 1 ", [ apiToken.user_id ]);
                    if (user) {
                        log.info("api-auth", `${req.method} ${req.originalUrl} - Authenticated via API token (prefix: ${apiToken.token_prefix}, user_id: ${apiToken.user_id})`);
                        next();
                        return;
                    }
                    log.warn("api-auth", `API token matched (prefix: ${apiToken.token_prefix}) but owning user_id=${apiToken.user_id} not found or inactive`);
                }
            }

            log.warn("api-auth", `${req.method} ${req.originalUrl} - Authentication failed for token ${tokenPreview}... (checked ${activeTokens.length} API token(s))`);
            res.status(401).json({ message: "Invalid or expired token" });
        } catch (e) {
            log.error("api-auth", e);
            res.status(401).json({ message: "Authentication failed" });
        }
    };
}
