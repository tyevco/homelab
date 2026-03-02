import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManageApiTokenSocketHandler } from "../backend/socket-handlers/manage-api-token-socket-handler";
import type { HomelabSocket } from "../backend/util-server";
import type { HomelabServer } from "../backend/homelab-server";

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        dispense: vi.fn(),
        store: vi.fn(),
        findOne: vi.fn(),
        find: vi.fn(),
        trash: vi.fn(),
    }
}));

// Mock password-hash
vi.mock("../backend/password-hash", () => ({
    generatePasswordHash: vi.fn((pw: string) => `hashed_${pw}`),
    verifyPassword: vi.fn(),
}));

import { R } from "redbean-node";

const handlers: Record<string, (...args: unknown[]) => void> = {};
const mockSocket = {
    id: "test-socket",
    userID: 0,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
    }),
    emit: vi.fn(),
} as unknown as HomelabSocket;

const mockServer = {} as unknown as HomelabServer;

describe("ManageApiTokenSocketHandler", () => {
    let handler: ManageApiTokenSocketHandler;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(handlers).forEach((key) => delete handlers[key]);
        mockSocket.userID = 0;
        handler = new ManageApiTokenSocketHandler();
        handler.create(mockSocket, mockServer);
    });

    describe("addApiToken", () => {
        it("should register the addApiToken event", () => {
            expect(handlers["addApiToken"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["addApiToken"]({ name: "test" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should reject non-object data", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["addApiToken"]("not-an-object", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Data must be an object",
            }));
        });

        it("should reject null data", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["addApiToken"](null, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Data must be an object",
            }));
        });

        it("should reject empty name", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["addApiToken"]({ name: "" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Token name is required",
            }));
        });

        it("should reject missing name", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["addApiToken"]({}, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Token name is required",
            }));
        });

        it("should reject whitespace-only name", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["addApiToken"]({ name: "   " }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Token name is required",
            }));
        });

        it("should create token and return raw token once", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;

            const mockBean = {
                user_id: 0,
                name: "",
                token_hash: "",
                token_prefix: "",
                active: false,
                toJSON: vi.fn(() => ({
                    id: 1,
                    name: "My Token",
                    tokenPrefix: "hlk_abcdef",
                    active: true,
                    createdAt: "2026-03-02",
                })),
            };
            vi.mocked(R.dispense).mockReturnValue(mockBean as never);
            vi.mocked(R.store).mockResolvedValue(undefined as never);

            const callback = vi.fn();
            await handlers["addApiToken"]({ name: "My Token" }, callback);

            expect(R.dispense).toHaveBeenCalledWith("api_token");
            expect(mockBean.user_id).toBe(1);
            expect(mockBean.name).toBe("My Token");
            expect(mockBean.active).toBe(true);
            expect(mockBean.token_hash).toMatch(/^hashed_hlk_/);
            expect(mockBean.token_prefix).toMatch(/^hlk_/);
            expect(mockBean.token_prefix).toHaveLength(10);
            expect(R.store).toHaveBeenCalledWith(mockBean);

            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: true,
                msg: "apiTokenCreated",
                msgi18n: true,
            }));
            // Verify raw token is returned
            const callArg = callback.mock.calls[0][0];
            expect(callArg.token).toMatch(/^hlk_/);
            expect(callArg.token).toHaveLength(44); // "hlk_" (4) + 40 chars
            expect(callArg.data).toBeDefined();
        });

        it("should trim the token name", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;

            const mockBean = {
                user_id: 0,
                name: "",
                token_hash: "",
                token_prefix: "",
                active: false,
                toJSON: vi.fn(() => ({})),
            };
            vi.mocked(R.dispense).mockReturnValue(mockBean as never);
            vi.mocked(R.store).mockResolvedValue(undefined as never);

            const callback = vi.fn();
            await handlers["addApiToken"]({ name: "  My Token  " }, callback);

            expect(mockBean.name).toBe("My Token");
        });

        it("should handle non-function callback gracefully", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            await expect(handlers["addApiToken"]({ name: "test" }, "not-a-fn")).resolves.not.toThrow();
        });
    });

    describe("removeApiToken", () => {
        it("should register the removeApiToken event", () => {
            expect(handlers["removeApiToken"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["removeApiToken"](1, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should reject non-number token ID", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["removeApiToken"]("not-a-number", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Token ID must be a number",
            }));
        });

        it("should reject if token not found", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            vi.mocked(R.findOne).mockResolvedValue(null as never);

            const callback = vi.fn();
            await handlers["removeApiToken"](999, callback);
            expect(R.findOne).toHaveBeenCalledWith("api_token", " id = ? AND user_id = ? ", [ 999, 1 ]);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Token not found",
            }));
        });

        it("should trash the token bean on success", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const mockBean = { id: 5,
                user_id: 1 };
            vi.mocked(R.findOne).mockResolvedValue(mockBean as never);
            vi.mocked(R.trash).mockResolvedValue(undefined as never);

            const callback = vi.fn();
            await handlers["removeApiToken"](5, callback);

            expect(R.trash).toHaveBeenCalledWith(mockBean);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: true,
                msg: "apiTokenRevoked",
                msgi18n: true,
            }));
        });
    });

    describe("getApiTokenList", () => {
        it("should register the getApiTokenList event", () => {
            expect(handlers["getApiTokenList"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["getApiTokenList"](callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should return list of tokens for logged in user", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const mockTokens = [
                { toJSON: vi.fn(() => ({ id: 1,
                    name: "Token A",
                    tokenPrefix: "hlk_aaaaaa",
                    active: true,
                    createdAt: "2026-03-01" })) },
                { toJSON: vi.fn(() => ({ id: 2,
                    name: "Token B",
                    tokenPrefix: "hlk_bbbbbb",
                    active: true,
                    createdAt: "2026-03-02" })) },
            ];
            vi.mocked(R.find).mockResolvedValue(mockTokens as never);

            const callback = vi.fn();
            await handlers["getApiTokenList"](callback);

            expect(R.find).toHaveBeenCalledWith("api_token", " user_id = ? ORDER BY created_at DESC ", [ 1 ]);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: true,
            }));
            const callArg = callback.mock.calls[0][0];
            expect(callArg.data).toHaveLength(2);
            expect(callArg.data[0].name).toBe("Token A");
            expect(callArg.data[1].name).toBe("Token B");
        });

        it("should return empty list when user has no tokens", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            vi.mocked(R.find).mockResolvedValue([] as never);

            const callback = vi.fn();
            await handlers["getApiTokenList"](callback);

            const callArg = callback.mock.calls[0][0];
            expect(callArg.ok).toBe(true);
            expect(callArg.data).toEqual([]);
        });
    });
});
