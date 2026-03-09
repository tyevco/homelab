import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnraidSocketHandler } from "../backend/agent-socket-handlers/unraid-socket-handler";
import { AgentSocket } from "../common/agent-socket";
import type { HomelabSocket } from "../backend/util-server";
import type { HomelabServer } from "../backend/homelab-server";

// Mock promisify-child-process
vi.mock("promisify-child-process", () => ({
    default: {
        spawn: vi.fn(),
    },
}));

// Mock fs/promises
vi.mock("fs", async () => {
    const actual = await vi.importActual("fs");
    return {
        ...actual,
        promises: {
            readFile: vi.fn(),
        },
    };
});

// Mock ini
vi.mock("ini", () => ({
    parse: vi.fn((content: string) => {
        // Minimal INI parser for tests
        const result: Record<string, Record<string, string>> = {};
        let current = "";
        for (const line of content.split("\n")) {
            const sectionMatch = line.match(/^\[(.+)\]$/);
            if (sectionMatch) {
                current = sectionMatch[1];
                result[current] = {};
            } else if (current) {
                const eq = line.indexOf("=");
                if (eq !== -1) {
                    result[current][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
                }
            }
        }
        return result;
    }),
}));

import { promises as fsPromises } from "fs";
import childProcessAsync from "promisify-child-process";

const mockSocket = {
    id: "test-socket",
    userID: 1,
    endpoint: "",
    emit: vi.fn(),
    emitAgent: vi.fn(),
} as unknown as HomelabSocket;

const mockServer = {} as unknown as HomelabServer;

async function callAgent(agentSocket: AgentSocket, event: string, ...args: unknown[]) {
    const handler = agentSocket.eventList.get(event);
    if (handler) {
        await handler(...args);
    }
}

describe("UnraidSocketHandler", () => {
    let handler: UnraidSocketHandler;
    let agentSocket: AgentSocket;

    beforeEach(() => {
        vi.clearAllMocks();
        mockSocket.userID = 1;
        agentSocket = new AgentSocket();
        handler = new UnraidSocketHandler();
        handler.create(mockSocket, mockServer, agentSocket);
    });

    describe("getUnraidDisks", () => {
        it("registers the event", () => {
            expect(agentSocket.eventList.has("getUnraidDisks")).toBe(true);
        });

        it("rejects when not logged in", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 0;
            const callback = vi.fn();
            await callAgent(agentSocket, "getUnraidDisks", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
        });

        it("returns parsed disk data", async () => {
            vi.mocked(fsPromises.readFile).mockResolvedValue(
                "[disk1]\nname=disk1\ndevice=sdb\nstatus=DISK_OK\n" as never
            );
            const callback = vi.fn();
            await callAgent(agentSocket, "getUnraidDisks", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
            const result = callback.mock.calls[0][0];
            expect(Array.isArray(result.data)).toBe(true);
        });
    });

    describe("getUnraidArrayStatus", () => {
        it("registers the event", () => {
            expect(agentSocket.eventList.has("getUnraidArrayStatus")).toBe(true);
        });

        it("parses key=value lines from /proc/mdcmd", async () => {
            vi.mocked(fsPromises.readFile).mockResolvedValue(
                "mdState=STARTED\nmdNumErrors=0\n" as never
            );
            const callback = vi.fn();
            await callAgent(agentSocket, "getUnraidArrayStatus", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
            const result = callback.mock.calls[0][0];
            expect(result.data.mdState).toBe("STARTED");
            expect(result.data.mdNumErrors).toBe("0");
        });
    });

    describe("getUnraidShares", () => {
        it("registers the event", () => {
            expect(agentSocket.eventList.has("getUnraidShares")).toBe(true);
        });

        it("returns parsed shares", async () => {
            vi.mocked(fsPromises.readFile).mockResolvedValue(
                "[media]\nname=media\nfree=100GB\n" as never
            );
            const callback = vi.fn();
            await callAgent(agentSocket, "getUnraidShares", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });
    });

    describe("getUnraidVms", () => {
        it("registers the event", () => {
            expect(agentSocket.eventList.has("getUnraidVms")).toBe(true);
        });
    });

    describe("startUnraidVm", () => {
        it("validates VM name type", async () => {
            const callback = vi.fn();
            await callAgent(agentSocket, "startUnraidVm", 123, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
        });

        it("calls virsh start with VM name", async () => {
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({} as never);
            const callback = vi.fn();
            await callAgent(agentSocket, "startUnraidVm", "my-vm", callback);
            expect(childProcessAsync.spawn).toHaveBeenCalledWith("virsh", [ "start", "my-vm" ], expect.any(Object));
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });
    });

    describe("stopUnraidVm", () => {
        it("validates VM name type", async () => {
            const callback = vi.fn();
            await callAgent(agentSocket, "stopUnraidVm", null, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
        });

        it("calls virsh shutdown with VM name", async () => {
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({} as never);
            const callback = vi.fn();
            await callAgent(agentSocket, "stopUnraidVm", "my-vm", callback);
            expect(childProcessAsync.spawn).toHaveBeenCalledWith("virsh", [ "shutdown", "my-vm" ], expect.any(Object));
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });
    });
});
