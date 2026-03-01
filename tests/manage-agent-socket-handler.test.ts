import { describe, it, expect, vi, beforeEach } from "vitest";
import { ManageAgentSocketHandler } from "../backend/socket-handlers/manage-agent-socket-handler";
import type { HomelabSocket } from "../backend/util-server";
import type { HomelabServer } from "../backend/homelab-server";
import type { AgentManager } from "../backend/agent-manager";

const mockInstanceManager = {
    test: vi.fn(),
    add: vi.fn(),
    connect: vi.fn(),
    remove: vi.fn(),
    sendAgentList: vi.fn(),
} as unknown as AgentManager;

const handlers: Record<string, (...args: unknown[]) => void> = {};
const mockSocket = {
    id: "test-socket",
    userID: 0,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
        handlers[event] = handler;
    }),
    emit: vi.fn(),
    instanceManager: mockInstanceManager,
} as unknown as HomelabSocket;

const mockServer = {
    disconnectAllSocketClients: vi.fn(),
} as unknown as HomelabServer;

describe("ManageAgentSocketHandler", () => {
    let handler: ManageAgentSocketHandler;

    beforeEach(() => {
        vi.clearAllMocks();
        Object.keys(handlers).forEach((key) => delete handlers[key]);
        mockSocket.userID = 0;
        handler = new ManageAgentSocketHandler();
        handler.create(mockSocket, mockServer);
    });

    describe("addAgent", () => {
        it("should register the addAgent event", () => {
            expect(handlers["addAgent"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["addAgent"]({ url: "http://example.com",
                username: "admin",
                password: "pass" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should reject non-object data", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["addAgent"]("not-an-object", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Data must be an object",
            }));
        });

        it("should reject null data", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["addAgent"](null, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Data must be an object",
            }));
        });

        it("should test connection, add agent, and refresh other clients", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            vi.mocked(mockInstanceManager.test).mockResolvedValue(undefined);
            vi.mocked(mockInstanceManager.add).mockResolvedValue({} as never);
            vi.mocked(mockInstanceManager.sendAgentList).mockResolvedValue(undefined);

            const callback = vi.fn();
            const data = { url: "http://agent.local:5001",
                username: "admin",
                password: "secret" };
            await handlers["addAgent"](data, callback);

            expect(mockInstanceManager.test).toHaveBeenCalledWith(data.url, data.username, data.password);
            expect(mockInstanceManager.add).toHaveBeenCalledWith(data.url, data.username, data.password);
            expect(mockInstanceManager.connect).toHaveBeenCalledWith(data.url, data.username, data.password);
            expect(mockServer.disconnectAllSocketClients).toHaveBeenCalledWith(undefined, "test-socket");
            expect(mockInstanceManager.sendAgentList).toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });

        it("should propagate test connection errors", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            vi.mocked(mockInstanceManager.test).mockRejectedValue(new Error("Connection failed"));

            const callback = vi.fn();
            await handlers["addAgent"]({ url: "http://bad.local",
                username: "admin",
                password: "pass" }, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Connection failed",
            }));
        });

        it("should handle non-function callback gracefully", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            // Should not throw even with non-function callback
            await expect(handlers["addAgent"]({ url: "http://x.local",
                username: "a",
                password: "b" }, "not-a-fn")).resolves.not.toThrow();
        });
    });

    describe("removeAgent", () => {
        it("should register the removeAgent event", () => {
            expect(handlers["removeAgent"]).toBeDefined();
        });

        it("should reject if not logged in", async () => {
            const callback = vi.fn();
            await handlers["removeAgent"]("http://example.com", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "You are not logged in.",
            }));
        });

        it("should reject non-string URL", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            const callback = vi.fn();
            await handlers["removeAgent"](123, callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "URL must be a string",
            }));
        });

        it("should remove agent and refresh other clients", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            vi.mocked(mockInstanceManager.remove).mockResolvedValue(undefined);
            vi.mocked(mockInstanceManager.sendAgentList).mockResolvedValue(undefined);

            const callback = vi.fn();
            await handlers["removeAgent"]("http://agent.local:5001", callback);

            expect(mockInstanceManager.remove).toHaveBeenCalledWith("http://agent.local:5001");
            expect(mockServer.disconnectAllSocketClients).toHaveBeenCalledWith(undefined, "test-socket");
            expect(mockInstanceManager.sendAgentList).toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
        });

        it("should propagate removal errors", async () => {
            (mockSocket as unknown as Record<string, unknown>).userID = 1;
            vi.mocked(mockInstanceManager.remove).mockRejectedValue(new Error("Agent not found"));

            const callback = vi.fn();
            await handlers["removeAgent"]("http://unknown.local", callback);
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({
                ok: false,
                msg: "Agent not found",
            }));
        });
    });
});
