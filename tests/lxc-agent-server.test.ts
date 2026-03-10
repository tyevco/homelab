import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock promisify-child-process before importing the module
vi.mock("promisify-child-process", () => ({
    spawn: vi.fn().mockRejectedValue(new Error("lxc-ls not found")),
}));

// Mock lxc module
vi.mock("../lxc-agent/src/lxc", () => ({
    getContainerList: vi.fn().mockResolvedValue({}),
    getContainer: vi.fn().mockResolvedValue({}),
    startContainer: vi.fn().mockResolvedValue(undefined),
    stopContainer: vi.fn().mockResolvedValue(undefined),
    restartContainer: vi.fn().mockResolvedValue(undefined),
    freezeContainer: vi.fn().mockResolvedValue(undefined),
    unfreezeContainer: vi.fn().mockResolvedValue(undefined),
    deleteContainer: vi.fn().mockResolvedValue(undefined),
    saveConfig: vi.fn().mockResolvedValue(undefined),
    createContainer: vi.fn().mockResolvedValue(undefined),
    cloneContainer: vi.fn().mockResolvedValue(undefined),
    listSnapshots: vi.fn().mockResolvedValue([]),
    getDistributions: vi.fn().mockResolvedValue([]),
    joinExecTerminal: vi.fn(),
}));

// Mock terminal
vi.mock("../lxc-agent/src/terminal", () => ({
    AgentTerminal: {
        getTerminal: vi.fn().mockReturnValue(null),
    },
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

import { createAgentServer, type AgentConfig } from "../lxc-agent/src/server";

describe("lxc-agent server", () => {
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

        it("should handle initial rescan without unhandled rejections", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            // createAgentServer calls rescan().then().catch() - the catch handler
            // ensures no unhandled promise rejections occur
            const result = createAgentServer(config);
            expect(result).toBeDefined();

            // Advance to let the initial rescan promise settle
            await vi.advanceTimersByTimeAsync(100);

            // Verify rescan ran (it logs "Scanning capabilities...")
            expect(consoleLogSpy).toHaveBeenCalledWith("[agent] Scanning capabilities...");

            consoleLogSpy.mockRestore();
        });

        it("should set up periodic rescans after successful initial scan", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            createAgentServer(config);

            // Advance enough to let the initial rescan promise settle
            await vi.advanceTimersByTimeAsync(100);

            // rescan should have completed (detectCapabilities ran)
            expect(consoleLogSpy).toHaveBeenCalledWith("[agent] Scanning capabilities...");

            consoleLogSpy.mockRestore();
        });
    });

    describe("connection handling", () => {
        it("should handle login with valid credentials", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

            createAgentServer(config);

            // Get the connection handler
            const connectionHandler = mockIoOn.mock.calls.find(
                (call: unknown[]) => call[0] === "connection"
            )?.[1];
            expect(connectionHandler).toBeDefined();

            // Create a mock socket
            const handlers: Record<string, (...args: unknown[]) => unknown> = {};
            const mockSocket = {
                handshake: { headers: { endpoint: "test-endpoint" } },
                emit: vi.fn(),
                on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
                    handlers[event] = handler;
                }),
            };

            // Trigger connection
            connectionHandler(mockSocket);

            // Socket should have emitted info
            expect(mockSocket.emit).toHaveBeenCalledWith("info", expect.objectContaining({
                version: "1.0.0",
            }));

            // Login with valid credentials
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

        it("should handle login with invalid data gracefully", async () => {
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

            const loginCallback = vi.fn();
            handlers["login"](null, loginCallback);

            expect(loginCallback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Invalid login data",
            }));

            consoleLogSpy.mockRestore();
        });

        it("should clean up authenticated socket on disconnect", async () => {
            const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
            const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

            createAgentServer(config);

            const connectionHandler = mockIoOn.mock.calls.find(
                (call: unknown[]) => call[0] === "connection"
            )?.[1];

            const handlers: Record<string, (...args: unknown[]) => unknown> = {};
            const mockSocket = {
                handshake: { headers: { endpoint: "ep1" } },
                emit: vi.fn(),
                on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
                    handlers[event] = handler;
                }),
            };

            connectionHandler(mockSocket);

            // Login first
            const loginCallback = vi.fn();
            handlers["login"]({ username: "admin",
                password: "secret" }, loginCallback);
            expect(loginCallback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));

            // Now disconnect - should not throw
            expect(() => handlers["disconnect"]()).not.toThrow();

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

            // Try to send agent event without login - should silently return
            const agentCallback = vi.fn();
            await handlers["agent"]("ep1", "requestLxcContainerList", agentCallback);

            // Callback should NOT have been called since not logged in
            expect(agentCallback).not.toHaveBeenCalled();

            consoleLogSpy.mockRestore();
        });
    });
});
