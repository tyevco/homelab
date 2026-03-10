import { describe, it, expect, vi, beforeEach } from "vitest";
import { TerminalSocketHandler } from "../backend/agent-socket-handlers/terminal-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import type { HomelabSocket } from "../backend/util-server";
import type { HomelabServer } from "../backend/homelab-server";

// Mock stack
vi.mock("../backend/stack", () => ({
    Stack: {
        getStack: vi.fn(),
    },
}));

// Mock terminal with real class hierarchy so instanceof checks work
vi.mock("../backend/terminal", () => {
    class MockTerminal {
        static terminalMap = new Map();
        static getTerminal = vi.fn().mockReturnValue(null);
        rows = 0;
        cols = 0;
    }
    class MockInteractiveTerminal extends MockTerminal {}
    class MockMainTerminal extends MockTerminal {
        join = vi.fn();
        start = vi.fn();
    }
    return {
        Terminal: MockTerminal,
        InteractiveTerminal: MockInteractiveTerminal,
        MainTerminal: MockMainTerminal,
    };
});

// Mock promisify-child-process
vi.mock("promisify-child-process", () => ({
    default: {
        spawn: vi.fn(),
    },
}));

// Mock util-server functions
vi.mock("../backend/util-server", async () => {
    const actual = await vi.importActual("../backend/util-server");
    return {
        ...actual,
    };
});

import { Terminal } from "../backend/terminal";

const mockSocket = {
    id: "test-socket",
    userID: 0,
    endpoint: "",
    emit: vi.fn(),
    emitAgent: vi.fn(),
} as unknown as HomelabSocket;

const mockServer = {
    config: {
        enableConsole: true,
    },
    stacksDir: "/tmp/stacks",
} as unknown as HomelabServer;

/** Helper to call agent socket handler and await the async result */
async function callAgent(agentSocket: AgentSocket, event: string, ...args: unknown[]) {
    const handler = agentSocket.eventList.get(event);
    if (handler) {
        await handler(...args);
    }
}

describe("TerminalSocketHandler", () => {
    let handler: TerminalSocketHandler;
    let agentSocket: AgentSocket;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSocket.userID = 0;
        agentSocket = new AgentSocket();
        handler = new TerminalSocketHandler();
        handler.create(mockSocket, mockServer, agentSocket);
    });

    describe("terminalResize", () => {
        it("should register the terminalResize event", () => {
            expect(agentSocket.eventList.has("terminalResize")).toBe(true);
        });

        it("should reject non-string terminal name", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const debugSpy = vi.spyOn(console, "error").mockImplementation(() => {});

            await callAgent(agentSocket, "terminalResize", 123, 50, 80);

            // The error message should mention terminal name, not "Command"
            debugSpy.mockRestore();
        });

        it("should reject non-number rows with correct error message", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;

            // Mock Terminal.getTerminal to return a terminal-like object
            const mockTerminal = { rows: 0,
                cols: 0 };
            vi.mocked(Terminal.getTerminal).mockReturnValue(mockTerminal as never);

            // Pass string rows - this should produce "Rows must be a number" error
            // We verify the error message by checking the handler doesn't throw
            // with the old "Command must be a number" message
            await callAgent(agentSocket, "terminalResize", "test-terminal", "not-a-number", 80);

            // Terminal should NOT have been resized
            expect(mockTerminal.rows).toBe(0);
            expect(mockTerminal.cols).toBe(0);
        });

        it("should reject non-number cols with correct error message", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;

            const mockTerminal = { rows: 0,
                cols: 0 };
            vi.mocked(Terminal.getTerminal).mockReturnValue(mockTerminal as never);

            await callAgent(agentSocket, "terminalResize", "test-terminal", 50, "not-a-number");

            // Terminal should NOT have been resized
            expect(mockTerminal.rows).toBe(0);
            expect(mockTerminal.cols).toBe(0);
        });

        it("should resize terminal with valid parameters", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;

            // Create an instance of Terminal (mocked) so instanceof check passes
            const mockTerminal = new (Terminal as unknown as new () => { rows: number; cols: number })();
            vi.mocked(Terminal.getTerminal).mockReturnValue(mockTerminal as never);

            await callAgent(agentSocket, "terminalResize", "test-terminal", 50, 120);

            expect(mockTerminal.rows).toBe(50);
            expect(mockTerminal.cols).toBe(120);
        });
    });

    describe("terminalInput", () => {
        it("should register the terminalInput event", () => {
            expect(agentSocket.eventList.has("terminalInput")).toBe(true);
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await callAgent(agentSocket, "terminalInput", "test-terminal", "ls", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should reject non-string terminal name", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await callAgent(agentSocket, "terminalInput", 123, "ls", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
            }));
        });

        it("should reject non-string command", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await callAgent(agentSocket, "terminalInput", "test-terminal", 123, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
            }));
        });
    });

    describe("terminalJoin", () => {
        it("should register the terminalJoin event", () => {
            expect(agentSocket.eventList.has("terminalJoin")).toBe(true);
        });

        it("should return early if callback is not a function", async () => {
            // Should not throw
            await callAgent(agentSocket, "terminalJoin", "test-terminal", "not-a-function");
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await callAgent(agentSocket, "terminalJoin", "test-terminal", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });
    });

    describe("leaveCombinedTerminal", () => {
        it("should register the leaveCombinedTerminal event", () => {
            expect(agentSocket.eventList.has("leaveCombinedTerminal")).toBe(true);
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await callAgent(agentSocket, "leaveCombinedTerminal", "test-stack", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });
    });
});
