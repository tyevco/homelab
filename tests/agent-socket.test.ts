import { describe, it, expect, vi } from "vitest";
import { AgentSocket } from "../common/agent-socket";

describe("AgentSocket", () => {

    describe("on", () => {
        it("should register event handler", () => {
            const socket = new AgentSocket();
            const handler = vi.fn();
            socket.on("test", handler);
            expect(socket.eventList.has("test")).toBe(true);
        });

        it("should overwrite existing handler for same event", () => {
            const socket = new AgentSocket();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            socket.on("event", handler1);
            socket.on("event", handler2);

            socket.call("event");
            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });
    });

    describe("call", () => {
        it("should invoke registered handler with arguments", () => {
            const socket = new AgentSocket();
            const handler = vi.fn();
            socket.on("myEvent", handler);

            socket.call("myEvent", "arg1", 42, true);
            expect(handler).toHaveBeenCalledWith("arg1", 42, true);
        });

        it("should not throw for unregistered event", () => {
            const socket = new AgentSocket();
            expect(() => socket.call("unknown")).not.toThrow();
        });

        it("should call handler with no args when none provided", () => {
            const socket = new AgentSocket();
            const handler = vi.fn();
            socket.on("noArgs", handler);

            socket.call("noArgs");
            expect(handler).toHaveBeenCalledWith();
        });

        it("should handle multiple different events independently", () => {
            const socket = new AgentSocket();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            socket.on("event1", handler1);
            socket.on("event2", handler2);

            socket.call("event1", "data1");
            expect(handler1).toHaveBeenCalledWith("data1");
            expect(handler2).not.toHaveBeenCalled();

            socket.call("event2", "data2");
            expect(handler2).toHaveBeenCalledWith("data2");
        });
    });

    describe("eventList", () => {
        it("should start empty", () => {
            const socket = new AgentSocket();
            expect(socket.eventList.size).toBe(0);
        });
    });
});
