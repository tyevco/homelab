import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock BeanModel to avoid ORM initialization
vi.mock("redbean-node/dist/bean-model", () => ({
    BeanModel: class BeanModel {
        [key: string]: unknown;
        constructor(_type?: string, _R?: unknown) { }
    },
}));

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        findAll: vi.fn(),
    }
}));

import { Agent } from "../backend/models/agent";
import { R } from "redbean-node";

// Helper to create a mock Agent with url property
function createMockAgent(url: string, username: string): Agent {
    const agent = new (Agent as unknown as new () => Agent)();
    (agent as unknown as Record<string, string>).url = url;
    (agent as unknown as Record<string, string>).username = username;
    return agent;
}

describe("Agent", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("endpoint getter", () => {
        it("should return host from URL with port", () => {
            const agent = createMockAgent("http://example.com:3000", "admin");
            expect(agent.endpoint).toBe("example.com:3000");
        });

        it("should return host from URL without explicit port", () => {
            const agent = createMockAgent("http://example.com", "admin");
            expect(agent.endpoint).toBe("example.com");
        });

        it("should return host from HTTPS URL", () => {
            const agent = createMockAgent("https://secure.example.com:8443", "admin");
            expect(agent.endpoint).toBe("secure.example.com:8443");
        });

        it("should throw for invalid URL", () => {
            const agent = createMockAgent("not-a-valid-url", "admin");
            expect(() => agent.endpoint).toThrow();
        });
    });

    describe("toJSON", () => {
        it("should return object with url, username, and endpoint", () => {
            const agent = createMockAgent("http://test.com:3000", "user1");
            const json = agent.toJSON();
            expect(json).toEqual({
                url: "http://test.com:3000",
                username: "user1",
                endpoint: "test.com:3000",
            });
        });
    });

    describe("getAgentList", () => {
        it("should return empty object for no agents", async () => {
            vi.mocked(R.findAll).mockResolvedValue([] as never);
            const result = await Agent.getAgentList();
            expect(result).toEqual({});
        });

        it("should index agents by endpoint", async () => {
            const agent1 = createMockAgent("http://host1.com:3000", "admin");
            const agent2 = createMockAgent("http://host2.com:4000", "user");
            vi.mocked(R.findAll).mockResolvedValue([ agent1, agent2 ] as never);

            const result = await Agent.getAgentList();
            expect(result["host1.com:3000"]).toBe(agent1);
            expect(result["host2.com:4000"]).toBe(agent2);
            expect(Object.keys(result)).toHaveLength(2);
        });

        it("should call R.findAll with 'agent'", async () => {
            vi.mocked(R.findAll).mockResolvedValue([] as never);
            await Agent.getAgentList();
            expect(R.findAll).toHaveBeenCalledWith("agent");
        });
    });
});
