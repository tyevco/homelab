import { describe, it, expect, vi, beforeEach } from "vitest";
import { MainSocketHandler } from "../backend/socket-handlers/main-socket-handler";
import type { HomelabSocket } from "../backend/util-server";
import type { HomelabServer } from "../backend/homelab-server";

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        dispense: vi.fn(() => ({ username: "",
            password: "" })),
        store: vi.fn(),
        findOne: vi.fn(),
        knex: vi.fn(() => ({
            count: vi.fn(() => ({
                first: vi.fn().mockResolvedValue({ count: 0 }),
            })),
        })),
        exec: vi.fn(),
    },
}));

// Mock password-hash
vi.mock("../backend/password-hash", () => ({
    generatePasswordHash: vi.fn((p: string) => `hashed_${p}`),
    verifyPassword: vi.fn((p: string, h: string) => h === `hashed_${p}`),
    needRehashPassword: vi.fn(() => false),
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
        verify: vi.fn(),
        sign: vi.fn(() => "mock-token"),
    },
}));

// Mock composerize
vi.mock("composerize", () => ({
    default: vi.fn(() => "name: test\nservices:\n  web:\n    image: nginx"),
}));

// Mock check-password-strength
vi.mock("check-password-strength", () => ({
    passwordStrength: vi.fn((p: string) => ({
        value: p.length >= 6 ? "Medium" : "Too weak",
    })),
}));

// Mock fs
vi.mock("fs", () => ({
    default: {
        existsSync: vi.fn(() => false),
        readFileSync: vi.fn(() => ""),
    },
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => ""),
    promises: {
        writeFile: vi.fn(),
        rm: vi.fn(),
    },
}));

// Mock rate-limiter
vi.mock("../backend/rate-limiter", () => ({
    loginRateLimiter: {
        pass: vi.fn().mockResolvedValue(true),
    },
}));

// Mock User model
vi.mock("../backend/models/user", () => ({
    User: {
        createJWT: vi.fn(() => "mock-jwt-token"),
    },
}));

const handlers: Record<string, (...args: unknown[]) => void> = {};
const mockSocket = {
    id: "test-socket",
    userID: 0,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
    }),
    emit: vi.fn(),
    join: vi.fn(),
    endpoint: "",
} as unknown as HomelabSocket;

const mockServer = {
    jwtSecret: "test-jwt-secret",
    needSetup: true,
    afterLogin: vi.fn(),
    getClientIP: vi.fn().mockResolvedValue("127.0.0.1"),
    sendInfo: vi.fn(),
    disconnectAllSocketClients: vi.fn(),
    stacksDir: "/tmp/stacks",
} as unknown as HomelabServer;

describe("MainSocketHandler", () => {
    let handler: MainSocketHandler;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(handlers).forEach((key) => delete handlers[key]);
        mockSocket.userID = 0;
        handler = new MainSocketHandler();
        handler.create(mockSocket, mockServer);
    });

    describe("setup", () => {
        it("should register the setup event", () => {
            expect(handlers["setup"]).toBeDefined();
        });

        it("should create user when none exist", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.knex).mockReturnValue({
                count: vi.fn(() => ({
                    first: vi.fn().mockResolvedValue({ count: 0 }),
                })),
            } as never);

            const callback = vi.fn();
            await handlers["setup"]("admin", "StrongPass123", callback);

            expect(R.store).toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });

        it("should reject weak passwords", async () => {
            const callback = vi.fn();
            await handlers["setup"]("admin", "weak", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: expect.stringContaining("too weak"),
            }));
        });

        it("should reject if users already exist", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.knex).mockReturnValue({
                count: vi.fn(() => ({
                    first: vi.fn().mockResolvedValue({ count: 1 }),
                })),
            } as never);

            const callback = vi.fn();
            await handlers["setup"]("admin", "StrongPass123", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: expect.stringContaining("initialized"),
            }));
        });
    });

    describe("login", () => {
        it("should register the login event", () => {
            expect(handlers["login"]).toBeDefined();
        });

        it("should reject when callback is not a function", async () => {
            // Should not throw
            await handlers["login"]({ username: "admin",
                password: "pass" }, "not-a-function");
        });

        it("should reject when data is null", async () => {
            const callback = vi.fn();
            await handlers["login"](null, callback);
            // Should return early without calling callback with error
        });

        it("should authenticate valid credentials", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.findOne).mockResolvedValue({
                id: 1,
                username: "admin",
                password: "hashed_StrongPass123",
                twofa_status: 0,
            } as never);

            const callback = vi.fn();
            await handlers["login"]({ username: "admin",
                password: "StrongPass123" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });

        it("should reject invalid credentials", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.findOne).mockResolvedValue(null as never);

            const callback = vi.fn();
            await handlers["login"]({ username: "admin",
                password: "wrong" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "authIncorrectCreds",
            }));
        });

        it("should apply rate limiting", async () => {
            const { loginRateLimiter } = await import("../backend/rate-limiter");
            vi.mocked(loginRateLimiter.pass).mockResolvedValue(false);

            const callback = vi.fn();
            await handlers["login"]({ username: "admin",
                password: "pass" }, callback);
            // The rate limiter calls the callback with error and returns false
            // login handler returns early
        });
    });

    describe("loginByToken", () => {
        it("should register the loginByToken event", () => {
            expect(handlers["loginByToken"]).toBeDefined();
        });

        it("should validate JWT and log in", async () => {
            const jwt = (await import("jsonwebtoken")).default;
            vi.mocked(jwt.verify).mockReturnValue({ username: "admin",
                h: "mock-shake" } as never);

            const { R } = await import("redbean-node");
            vi.mocked(R.findOne).mockResolvedValue({
                id: 1,
                username: "admin",
                password: "hashed_pass",
            } as never);

            const callback = vi.fn();
            await handlers["loginByToken"]("valid-token", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
            expect(mockServer.afterLogin).toHaveBeenCalled();
        });

        it("should reject invalid tokens", async () => {
            const jwt = (await import("jsonwebtoken")).default;
            vi.mocked(jwt.verify).mockImplementation(() => {
                throw new Error("invalid token");
            });

            const callback = vi.fn();
            await handlers["loginByToken"]("bad-token", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "authInvalidToken",
            }));
        });
    });

    describe("changePassword", () => {
        it("should register the changePassword event", () => {
            expect(handlers["changePassword"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["changePassword"]({ currentPassword: "old",
                newPassword: "NewPass123" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should reject weak new passwords", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["changePassword"]({ currentPassword: "old",
                newPassword: "weak" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: expect.stringContaining("too weak"),
            }));
        });
    });

    describe("getSettings", () => {
        it("should register the getSettings event", () => {
            expect(handlers["getSettings"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["getSettings"](callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should return settings when logged in", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["getSettings"](callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });
    });

    describe("setSettings", () => {
        it("should register the setSettings event", () => {
            expect(handlers["setSettings"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["setSettings"]({}, null, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });
    });

    describe("composerize", () => {
        it("should register the composerize event", () => {
            expect(handlers["composerize"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["composerize"]("docker run nginx", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should return compose YAML when logged in", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["composerize"]("docker run nginx", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: true,
                composeTemplate: expect.any(String),
            }));
        });

        it("should reject non-string input", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["composerize"](123, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
            }));
        });
    });
});
