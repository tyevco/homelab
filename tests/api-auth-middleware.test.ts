import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        findOne: vi.fn(),
        find: vi.fn(),
    }
}));

// Mock password-hash
vi.mock("../backend/password-hash", () => ({
    verifyPassword: vi.fn(),
}));

import { createApiAuthMiddleware } from "../backend/util-server";
import { R } from "redbean-node";
import { verifyPassword } from "../backend/password-hash";

const JWT_SECRET = "test-jwt-secret";

function createMockReqResNext() {
    const req = {
        headers: {} as Record<string, string>,
    };
    const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn().mockReturnThis(),
    };
    const next = vi.fn();
    return { req,
        res,
        next };
}

describe("createApiAuthMiddleware", () => {
    let middleware: ReturnType<typeof createApiAuthMiddleware>;

    beforeEach(() => {
        vi.clearAllMocks();
        middleware = createApiAuthMiddleware(JWT_SECRET);
    });

    it("should return a function", () => {
        expect(typeof middleware).toBe("function");
    });

    describe("missing/invalid Authorization header", () => {
        it("should return 401 when no Authorization header", async () => {
            const { req, res, next } = createMockReqResNext();
            await middleware(req as never, res as never, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: "Missing or invalid Authorization header" });
            expect(next).not.toHaveBeenCalled();
        });

        it("should return 401 when Authorization header is not Bearer", async () => {
            const { req, res, next } = createMockReqResNext();
            req.headers["authorization"] = "Basic dXNlcjpwYXNz";
            await middleware(req as never, res as never, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: "Missing or invalid Authorization header" });
            expect(next).not.toHaveBeenCalled();
        });

        it("should return 401 when Authorization header is empty Bearer", async () => {
            const { req, res, next } = createMockReqResNext();
            req.headers["authorization"] = "Bearer ";
            await middleware(req as never, res as never, next);

            // Empty string after Bearer will fail both JWT and token lookup
            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe("JWT authentication", () => {
        it("should authenticate with valid JWT and active user", async () => {
            const { req, res, next } = createMockReqResNext();
            const token = jwt.sign({ username: "admin" }, JWT_SECRET);
            req.headers["authorization"] = `Bearer ${token}`;

            vi.mocked(R.findOne).mockResolvedValue({ id: 1,
                username: "admin",
                active: true } as never);

            await middleware(req as never, res as never, next);

            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it("should fall through to API token check when JWT user not found", async () => {
            const { req, res, next } = createMockReqResNext();
            const token = jwt.sign({ username: "deleted-user" }, JWT_SECRET);
            req.headers["authorization"] = `Bearer ${token}`;

            // JWT user lookup returns null
            vi.mocked(R.findOne).mockResolvedValueOnce(null as never);
            // API token lookup returns empty
            vi.mocked(R.find).mockResolvedValue([] as never);

            await middleware(req as never, res as never, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("should reject JWT signed with wrong secret", async () => {
            const { req, res, next } = createMockReqResNext();
            const token = jwt.sign({ username: "admin" }, "wrong-secret");
            req.headers["authorization"] = `Bearer ${token}`;

            // Falls through to API token check
            vi.mocked(R.find).mockResolvedValue([] as never);

            await middleware(req as never, res as never, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe("API token authentication", () => {
        it("should authenticate with valid API token", async () => {
            const { req, res, next } = createMockReqResNext();
            req.headers["authorization"] = "Bearer hlk_some_random_token_value";

            // JWT will fail for non-JWT string, falls through
            const mockApiToken = {
                id: 1,
                user_id: 1,
                token_hash: "bcrypt_hash",
                active: true,
            };
            vi.mocked(R.find).mockResolvedValue([ mockApiToken ] as never);
            vi.mocked(verifyPassword).mockReturnValue(true);
            // User lookup for API token owner
            vi.mocked(R.findOne).mockResolvedValue({ id: 1,
                active: true } as never);

            await middleware(req as never, res as never, next);

            expect(verifyPassword).toHaveBeenCalledWith("hlk_some_random_token_value", "bcrypt_hash");
            expect(next).toHaveBeenCalled();
        });

        it("should reject API token when no hash matches", async () => {
            const { req, res, next } = createMockReqResNext();
            req.headers["authorization"] = "Bearer hlk_invalid_token";

            const mockApiToken = {
                id: 1,
                user_id: 1,
                token_hash: "bcrypt_hash",
                active: true,
            };
            vi.mocked(R.find).mockResolvedValue([ mockApiToken ] as never);
            vi.mocked(verifyPassword).mockReturnValue(false);

            await middleware(req as never, res as never, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ message: "Invalid or expired token" });
        });

        it("should reject API token when owning user is inactive", async () => {
            const { req, res, next } = createMockReqResNext();
            req.headers["authorization"] = "Bearer hlk_valid_but_user_inactive";

            const mockApiToken = {
                id: 1,
                user_id: 1,
                token_hash: "bcrypt_hash",
                active: true,
            };
            vi.mocked(R.find).mockResolvedValue([ mockApiToken ] as never);
            vi.mocked(verifyPassword).mockReturnValue(true);
            // User not found or inactive
            vi.mocked(R.findOne).mockResolvedValue(null as never);

            await middleware(req as never, res as never, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });

        it("should check multiple API tokens and match the correct one", async () => {
            const { req, res, next } = createMockReqResNext();
            req.headers["authorization"] = "Bearer hlk_second_token";

            const mockTokens = [
                { id: 1,
                    user_id: 1,
                    token_hash: "hash_first",
                    active: true },
                { id: 2,
                    user_id: 1,
                    token_hash: "hash_second",
                    active: true },
            ];
            vi.mocked(R.find).mockResolvedValue(mockTokens as never);
            vi.mocked(verifyPassword)
                .mockReturnValueOnce(false)  // first token doesn't match
                .mockReturnValueOnce(true);  // second token matches
            vi.mocked(R.findOne).mockResolvedValue({ id: 1,
                active: true } as never);

            await middleware(req as never, res as never, next);

            expect(verifyPassword).toHaveBeenCalledTimes(2);
            expect(next).toHaveBeenCalled();
        });

        it("should return 401 when no active API tokens exist", async () => {
            const { req, res, next } = createMockReqResNext();
            req.headers["authorization"] = "Bearer hlk_no_tokens_at_all";

            vi.mocked(R.find).mockResolvedValue([] as never);

            await middleware(req as never, res as never, next);

            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(401);
        });
    });

    describe("JWT takes priority over API token", () => {
        it("should not check API tokens when JWT succeeds", async () => {
            const { req, res, next } = createMockReqResNext();
            const token = jwt.sign({ username: "admin" }, JWT_SECRET);
            req.headers["authorization"] = `Bearer ${token}`;

            vi.mocked(R.findOne).mockResolvedValue({ id: 1,
                username: "admin",
                active: true } as never);

            await middleware(req as never, res as never, next);

            expect(R.find).not.toHaveBeenCalled();
            expect(verifyPassword).not.toHaveBeenCalled();
            expect(next).toHaveBeenCalled();
        });
    });
});
