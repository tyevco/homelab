import { describe, it, expect, vi } from "vitest";
import { loginRateLimiter, apiRateLimiter, twoFaRateLimiter, rateLimitMiddleware } from "../backend/rate-limiter";
import type { Request, Response, NextFunction } from "express";

describe("rate-limiter", () => {

    describe("pre-configured instances", () => {
        it("should export loginRateLimiter", () => {
            expect(loginRateLimiter).toBeDefined();
            expect(loginRateLimiter.errorMessage).toBe("Too frequently, try again later.");
        });

        it("should export apiRateLimiter", () => {
            expect(apiRateLimiter).toBeDefined();
            expect(apiRateLimiter.errorMessage).toBe("Too frequently, try again later.");
        });

        it("should export twoFaRateLimiter", () => {
            expect(twoFaRateLimiter).toBeDefined();
            expect(twoFaRateLimiter.errorMessage).toBe("Too frequently, try again later.");
        });
    });

    describe("pass", () => {
        it("should return true when tokens are available", async () => {
            const result = await apiRateLimiter.pass(vi.fn(), 0);
            expect(result).toBe(true);
        });

        it("should call callback with error when rate limited", async () => {
            const callback = vi.fn();
            // Consume all tokens in batches to trigger rate limiting
            for (let i = 0; i < 60; i++) {
                await apiRateLimiter.removeTokens(1);
            }
            const result = await apiRateLimiter.pass(callback, 1);
            expect(result).toBe(false);
            expect(callback).toHaveBeenCalledWith({
                ok: false,
                msg: "Too frequently, try again later.",
            });
        });

        it("should not throw when callback is falsy and rate limited", async () => {
            // Exhaust tokens one by one
            for (let i = 0; i < 20; i++) {
                await loginRateLimiter.removeTokens(1);
            }
            // null callback should not throw
            const result = await loginRateLimiter.pass(null as unknown as (err: object) => void, 1);
            expect(result).toBe(false);
        });
    });

    describe("removeTokens", () => {
        it("should return remaining token count", async () => {
            const remaining = await twoFaRateLimiter.removeTokens(0);
            expect(typeof remaining).toBe("number");
        });
    });

    describe("rateLimitMiddleware", () => {
        it("should call next() when tokens are available", async () => {
            const middleware = rateLimitMiddleware(twoFaRateLimiter);
            const req = {} as Request;
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as unknown as Response;
            const next = vi.fn() as NextFunction;

            // Use 0-token remove to avoid depleting tokens
            await middleware(req, res, next);
            expect(next).toHaveBeenCalled();
            expect(res.status).not.toHaveBeenCalled();
        });

        it("should return 429 when rate limited", async () => {
            const middleware = rateLimitMiddleware(apiRateLimiter);

            // Exhaust remaining tokens
            for (let i = 0; i < 65; i++) {
                await apiRateLimiter.removeTokens(1);
            }

            const req = {} as Request;
            const res = {
                status: vi.fn().mockReturnThis(),
                json: vi.fn(),
            } as unknown as Response;
            const next = vi.fn() as NextFunction;

            await middleware(req, res, next);
            expect(next).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(429);
            expect(res.json).toHaveBeenCalledWith({
                ok: false,
                msg: "Too frequently, try again later.",
            });
        });
    });
});
