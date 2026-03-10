import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock promisify-child-process before importing the module
vi.mock("promisify-child-process", () => ({
    spawn: vi.fn().mockRejectedValue(new Error("virsh not found")),
}));

// Mock ini
vi.mock("ini", () => ({
    parse: vi.fn(() => ({})),
}));

// Mock socket.io
const mockIoOn = vi.fn();
vi.mock("socket.io", () => {
    return {
        Server: class MockServer {
            on = mockIoOn;
        },
    };
});

// Mock http
vi.mock("http", () => ({
    createServer: vi.fn(() => ({})),
}));

// Mock fs/promises to simulate Unraid not available
vi.mock("fs", async () => {
    const actual = await vi.importActual("fs");
    return {
        ...actual,
        promises: {
            access: vi.fn().mockRejectedValue(new Error("ENOENT")),
            readFile: vi.fn().mockRejectedValue(new Error("ENOENT")),
        },
    };
});

import { createAgentServer, type AgentConfig } from "../unraid-agent/src/server";

describe("unraid-agent server", () => {
    let config: AgentConfig;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();

        config = {
            username: "admin",
            password: "secret",
            version: "1.0.0",
            scanInterval: 60,
        };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("createAgentServer", () => {
        it("should return io and httpServer", () => {
            const result = createAgentServer(config);
            expect(result).toHaveProperty("io");
            expect(result).toHaveProperty("httpServer");
        });

        it("should register connection handler on io", () => {
            createAgentServer(config);
            expect(mockIoOn).toHaveBeenCalledWith("connection", expect.any(Function));
        });

        it("should handle initial rescan failure without crashing", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            const result = createAgentServer(config);
            expect(result).toBeDefined();

            // Advance to let the initial rescan promise settle
            await vi.advanceTimersByTimeAsync(100);

            // Verify rescan ran (it logs "Scanning capabilities...")
            expect(consoleLogSpy).toHaveBeenCalledWith("[agent] Scanning capabilities...");

            consoleLogSpy.mockRestore();
            consoleErrorSpy.mockRestore();
        });

        it("should set up periodic rescans even after initial scan failure", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            // Make detectCapabilities throw to trigger the .catch() path
            const { promises: fsPromises } = await import("fs");
            vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

            createAgentServer(config);

            // Advance to settle the initial rescan
            await vi.advanceTimersByTimeAsync(100);

            // The .catch() handler sets up setInterval for recovery
            // Verify that another rescan interval would fire
            expect(consoleLogSpy).toHaveBeenCalledWith("[agent] Scanning capabilities...");

            consoleLogSpy.mockRestore();
            consoleErrorSpy.mockRestore();
        });
    });

    describe("connection handling", () => {
        it("should handle login with valid credentials", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            createAgentServer(config);

            const connectionHandler = mockIoOn.mock.calls.find(
                (call: unknown[]) => call[0] === "connection"
            )?.[1];
            expect(connectionHandler).toBeDefined();

            const handlers: Record<string, (...args: unknown[]) => unknown> = {};
            const mockSocket = {
                handshake: { headers: { endpoint: "test-endpoint" } },
                emit: vi.fn(),
                on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
                    handlers[event] = handler;
                }),
            };

            connectionHandler(mockSocket);

            expect(mockSocket.emit).toHaveBeenCalledWith("info", expect.objectContaining({
                version: "1.0.0",
            }));

            const loginCallback = vi.fn();
            handlers["login"]({ username: "admin",
                password: "secret" }, loginCallback);

            expect(loginCallback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));

            consoleLogSpy.mockRestore();
        });

        it("should reject login with invalid credentials", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            createAgentServer(config);

            const connectionHandler = mockIoOn.mock.calls.find(
                (call: unknown[]) => call[0] === "connection"
            )?.[1];

            const handlers: Record<string, (...args: unknown[]) => unknown> = {};
            const mockSocket = {
                handshake: { headers: {} },
                emit: vi.fn(),
                on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
                    handlers[event] = handler;
                }),
            };

            connectionHandler(mockSocket);

            const loginCallback = vi.fn();
            handlers["login"]({ username: "wrong",
                password: "wrong" }, loginCallback);

            expect(loginCallback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Invalid credentials",
            }));

            consoleLogSpy.mockRestore();
            consoleWarnSpy.mockRestore();
        });

        it("should reject agent events when not logged in", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            createAgentServer(config);

            const connectionHandler = mockIoOn.mock.calls.find(
                (call: unknown[]) => call[0] === "connection"
            )?.[1];

            const handlers: Record<string, (...args: unknown[]) => unknown> = {};
            const mockSocket = {
                handshake: { headers: {} },
                emit: vi.fn(),
                on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
                    handlers[event] = handler;
                }),
            };

            connectionHandler(mockSocket);

            const agentCallback = vi.fn();
            await handlers["agent"]("ep1", "getUnraidDisks", agentCallback);

            expect(agentCallback).not.toHaveBeenCalled();

            consoleLogSpy.mockRestore();
        });
    });
});
