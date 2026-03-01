import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentManager } from "../backend/agent-manager";
import type { HomelabSocket } from "../backend/util-server";

// Mock socket.io-client
vi.mock("socket.io-client", () => ({
    io: vi.fn(() => ({
        on: vi.fn(),
        emit: vi.fn(),
        disconnect: vi.fn(),
        connected: false,
    })),
}));

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        dispense: vi.fn(() => ({})),
        store: vi.fn(),
        findOne: vi.fn(),
        trash: vi.fn(),
    }
}));

// Mock Agent model
vi.mock("../backend/models/agent", () => ({
    Agent: {
        getAgentList: vi.fn().mockResolvedValue({}),
    }
}));

const mockSocket = {
    id: "test-socket",
    emit: vi.fn(),
    endpoint: "",
} as unknown as HomelabSocket;

describe("AgentManager", () => {
    let manager: AgentManager;

    beforeEach(() => {
        vi.clearAllMocks();
        manager = new AgentManager(mockSocket);
    });

    describe("constructor", () => {
        it("should initialize with empty agent lists", () => {
            expect(manager).toBeDefined();
            expect(manager.firstConnectTime).toBeDefined();
        });
    });

    describe("firstConnectTime", () => {
        it("should return a dayjs instance", () => {
            const time = manager.firstConnectTime;
            expect(time).toBeDefined();
            expect(typeof time.unix).toBe("function");
        });
    });

    describe("test", () => {
        it("should reject for invalid URL", async () => {
            await expect(manager.test("not-a-url", "user", "pass"))
                .rejects.toThrow();
        });

        it("should reject when endpoint already exists", async () => {
            // Access private field to simulate an existing connection
            const internals = manager as unknown as Record<string, Record<string, unknown>>;
            internals["agentSocketList"]["example.com:3000"] = {} as unknown as never;

            await expect(manager.test("http://example.com:3000", "user", "pass"))
                .rejects.toThrow("The Homelab URL already exists");
        });
    });

    describe("add", () => {
        it("should create and store a new agent bean", async () => {
            const { R } = await import("redbean-node");
            const bean = {
                url: "",
                username: "",
                password: "",
            } as Record<string, unknown>;
            vi.mocked(R.dispense).mockReturnValue(bean as never);
            vi.mocked(R.store).mockResolvedValue(undefined as never);

            const result = await manager.add("http://test.com:3000", "admin", "secret");
            expect(result.url).toBe("http://test.com:3000");
            expect(result.username).toBe("admin");
            expect(result.password).toBe("secret");
            expect(R.store).toHaveBeenCalled();
        });
    });

    describe("remove", () => {
        it("should throw when agent not found", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.findOne).mockResolvedValue(null as never);

            await expect(manager.remove("http://unknown.com"))
                .rejects.toThrow("Agent not found");
        });

        it("should remove found agent and update list", async () => {
            const { R } = await import("redbean-node");
            const bean = { endpoint: "test.com:3000" };
            vi.mocked(R.findOne).mockResolvedValue(bean as never);
            vi.mocked(R.trash).mockResolvedValue(undefined as never);

            await manager.remove("http://test.com:3000");
            expect(R.trash).toHaveBeenCalledWith(bean);
        });
    });

    describe("disconnect", () => {
        it("should call disconnect on socket client", () => {
            const mockClient = { disconnect: vi.fn() };
            const internals = manager as unknown as Record<string, Record<string, unknown>>;
            internals["agentSocketList"]["ep1"] = mockClient as never;

            manager.disconnect("ep1");
            expect(mockClient.disconnect).toHaveBeenCalled();
        });

        it("should handle non-existent endpoint gracefully", () => {
            expect(() => manager.disconnect("nonexistent")).not.toThrow();
        });
    });

    describe("disconnectAll", () => {
        it("should disconnect all connected agents", () => {
            const client1 = { disconnect: vi.fn() };
            const client2 = { disconnect: vi.fn() };
            const internals = manager as unknown as Record<string, Record<string, unknown>>;
            internals["agentSocketList"]["ep1"] = client1 as never;
            internals["agentSocketList"]["ep2"] = client2 as never;

            manager.disconnectAll();
            expect(client1.disconnect).toHaveBeenCalled();
            expect(client2.disconnect).toHaveBeenCalled();
        });

        it("should handle empty agent list", () => {
            expect(() => manager.disconnectAll()).not.toThrow();
        });
    });

    describe("emitToEndpoint", () => {
        it("should throw when socket client not found", async () => {
            await expect(manager.emitToEndpoint("unknown", "event"))
                .rejects.toThrow("Socket client not found for endpoint: unknown");
        });

        it("should emit when client is connected and logged in", async () => {
            const mockClient = {
                connected: true,
                emit: vi.fn(),
            };
            const internals = manager as unknown as Record<string, Record<string, unknown>>;
            internals["agentSocketList"]["ep1"] = mockClient as never;
            internals["agentLoggedInList"]["ep1"] = true;

            await manager.emitToEndpoint("ep1", "testEvent", "arg1", "arg2");
            expect(mockClient.emit).toHaveBeenCalledWith("agent", "ep1", "testEvent", "arg1", "arg2");
        });
    });

    describe("emitToAllEndpoints", () => {
        it("should emit to all endpoints", () => {
            const mockClient = {
                connected: true,
                emit: vi.fn(),
            };
            const internals = manager as unknown as Record<string, Record<string, unknown>>;
            internals["agentSocketList"]["ep1"] = mockClient as never;
            internals["agentLoggedInList"]["ep1"] = true;

            manager.emitToAllEndpoints("event", "data");
            // Fire-and-forget, just verify no throw
        });

        it("should handle empty endpoint list", () => {
            expect(() => manager.emitToAllEndpoints("event")).not.toThrow();
        });
    });

    describe("connectAll", () => {
        it("should skip when connection is an agent endpoint", async () => {
            const agentSocket = {
                ...mockSocket,
                endpoint: "some-agent",
            } as unknown as HomelabSocket;
            const agentManager = new AgentManager(agentSocket);
            await agentManager.connectAll();
            // Should return early without error
        });

        it("should handle empty agent list", async () => {
            await manager.connectAll();
            // Should not throw
        });
    });

    describe("sendAgentList", () => {
        it("should emit agentList with self entry", async () => {
            await manager.sendAgentList();
            expect(mockSocket.emit).toHaveBeenCalledWith("agentList", expect.objectContaining({
                ok: true,
                agentList: expect.objectContaining({
                    "": expect.objectContaining({
                        url: "",
                        endpoint: "",
                    }),
                }),
            }));
        });
    });
});
