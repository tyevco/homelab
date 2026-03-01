import { describe, it, expect, vi, beforeEach } from "vitest";
import { Terminal, MainTerminal } from "../backend/terminal";
import { TERMINAL_ROWS, TERMINAL_COLS } from "../common/util-common";
import type { HomelabServer } from "../backend/homelab-server";
import type { HomelabSocket } from "../backend/util-server";

// Mock node-pty to avoid native module issues in test
vi.mock("@homebridge/node-pty-prebuilt-multiarch", () => ({
    spawn: vi.fn(),
}));

// Mock command-exists
vi.mock("command-exists", () => ({
    sync: vi.fn(() => false),
}));

const mockServer = {
    stacksDir: "/tmp/stacks",
    config: { enableConsole: true },
} as unknown as HomelabServer;

const mockSocket = {
    id: "socket-1",
    connected: true,
    emitAgent: vi.fn(),
} as unknown as HomelabSocket;

const mockSocket2 = {
    id: "socket-2",
    connected: true,
    emitAgent: vi.fn(),
} as unknown as HomelabSocket;

// Access private static terminalMap
function getTerminalMap(): Map<string, Terminal> {
    return (Terminal as unknown as Record<string, unknown>)["terminalMap"] as Map<string, Terminal>;
}

describe("Terminal", () => {

    beforeEach(() => {
        // Clear the terminal map between tests
        getTerminalMap().clear();
    });

    describe("constructor", () => {
        it("should register terminal in the static map", () => {
            const terminal = new Terminal(mockServer, "test-term", "bash", [], "/tmp");
            expect(Terminal.getTerminal("test-term")).toBe(terminal);
        });

        it("should set default rows and cols", () => {
            const terminal = new Terminal(mockServer, "term-dims", "bash", [], "/tmp");
            expect(terminal.rows).toBe(TERMINAL_ROWS);
            expect(terminal.cols).toBe(TERMINAL_COLS);
        });
    });

    describe("name getter", () => {
        it("should return the terminal name", () => {
            const terminal = new Terminal(mockServer, "my-terminal", "bash", [], "/tmp");
            expect(terminal.name).toBe("my-terminal");
        });
    });

    describe("rows and cols setters", () => {
        it("should update rows", () => {
            const terminal = new Terminal(mockServer, "resize-test", "bash", [], "/tmp");
            terminal.rows = 50;
            expect(terminal.rows).toBe(50);
        });

        it("should update cols", () => {
            const terminal = new Terminal(mockServer, "resize-cols", "bash", [], "/tmp");
            terminal.cols = 200;
            expect(terminal.cols).toBe(200);
        });
    });

    describe("getBuffer", () => {
        it("should return empty string when buffer is empty", () => {
            const terminal = new Terminal(mockServer, "buf-empty", "bash", [], "/tmp");
            expect(terminal.getBuffer()).toBe("");
        });
    });

    describe("join and leave", () => {
        it("should add socket to socket list", () => {
            const terminal = new Terminal(mockServer, "join-test", "bash", [], "/tmp");
            terminal.join(mockSocket);
            // Socket is in the list (we can verify via leave not throwing)
            expect(() => terminal.leave(mockSocket)).not.toThrow();
        });

        it("should allow multiple sockets to join", () => {
            const terminal = new Terminal(mockServer, "multi-join", "bash", [], "/tmp");
            terminal.join(mockSocket);
            terminal.join(mockSocket2);
            // Both can leave without error
            terminal.leave(mockSocket);
            terminal.leave(mockSocket2);
        });

        it("should handle leaving when not joined", () => {
            const terminal = new Terminal(mockServer, "leave-nonjoin", "bash", [], "/tmp");
            expect(() => terminal.leave(mockSocket)).not.toThrow();
        });
    });

    describe("onExit", () => {
        it("should store exit callback", () => {
            const terminal = new Terminal(mockServer, "exit-cb", "bash", [], "/tmp");
            const callback = vi.fn();
            terminal.onExit(callback);
            // Callback is stored (we can't easily trigger exit without pty, but can verify no throw)
            expect(() => terminal.onExit(callback)).not.toThrow();
        });
    });

    describe("static getTerminal", () => {
        it("should return terminal by name", () => {
            const terminal = new Terminal(mockServer, "lookup-test", "bash", [], "/tmp");
            expect(Terminal.getTerminal("lookup-test")).toBe(terminal);
        });

        it("should return undefined for non-existent terminal", () => {
            expect(Terminal.getTerminal("nonexistent")).toBeUndefined();
        });
    });

    describe("static getOrCreateTerminal", () => {
        it("should create new terminal if not exists", () => {
            const terminal = Terminal.getOrCreateTerminal(mockServer, "new-term", "bash", [], "/tmp");
            expect(terminal).toBeDefined();
            expect(terminal.name).toBe("new-term");
        });

        it("should return existing terminal if already exists", () => {
            const first = Terminal.getOrCreateTerminal(mockServer, "existing-term", "bash", [], "/tmp");
            const second = Terminal.getOrCreateTerminal(mockServer, "existing-term", "bash", [], "/tmp");
            expect(first).toBe(second);
        });
    });

    describe("static getTerminalCount", () => {
        it("should return 0 when no terminals exist", () => {
            expect(Terminal.getTerminalCount()).toBe(0);
        });

        it("should return correct count", () => {
            new Terminal(mockServer, "count-1", "bash", [], "/tmp");
            new Terminal(mockServer, "count-2", "bash", [], "/tmp");
            expect(Terminal.getTerminalCount()).toBe(2);
        });
    });

    describe("close", () => {
        it("should not throw when pty process is not started", () => {
            const terminal = new Terminal(mockServer, "close-nopty", "bash", [], "/tmp");
            expect(() => terminal.close()).not.toThrow();
        });
    });
});

describe("MainTerminal", () => {
    beforeEach(() => {
        getTerminalMap().clear();
    });

    it("should throw if console is not enabled", () => {
        const disabledServer = {
            ...mockServer,
            config: { enableConsole: false },
        } as unknown as HomelabServer;

        expect(() => new MainTerminal(disabledServer, "main-term")).toThrow("Console is not enabled.");
    });

    it("should create terminal when console is enabled", () => {
        const terminal = new MainTerminal(mockServer, "main-enabled");
        expect(terminal.name).toBe("main-enabled");
    });
});
