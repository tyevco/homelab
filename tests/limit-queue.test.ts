import { describe, it, expect, vi } from "vitest";
import { LimitQueue } from "../backend/utils/limit-queue";

describe("LimitQueue", () => {

    it("should store items up to the limit", () => {
        const queue = new LimitQueue<number>(3);
        queue.pushItem(1);
        queue.pushItem(2);
        queue.pushItem(3);

        expect(queue.length).toBe(3);
        expect(queue[0]).toBe(1);
        expect(queue[1]).toBe(2);
        expect(queue[2]).toBe(3);
    });

    it("should remove the first element when exceeding the limit", () => {
        const queue = new LimitQueue<number>(3);
        queue.pushItem(1);
        queue.pushItem(2);
        queue.pushItem(3);
        queue.pushItem(4);

        expect(queue.length).toBe(3);
        expect(queue[0]).toBe(2);
        expect(queue[1]).toBe(3);
        expect(queue[2]).toBe(4);
    });

    it("should continue removing oldest items as new ones are added", () => {
        const queue = new LimitQueue<string>(2);
        queue.pushItem("a");
        queue.pushItem("b");
        queue.pushItem("c");
        queue.pushItem("d");

        expect(queue.length).toBe(2);
        expect(queue[0]).toBe("c");
        expect(queue[1]).toBe("d");
    });

    it("should call onExceed callback when an item is removed", () => {
        const queue = new LimitQueue<number>(2);
        const onExceed = vi.fn();
        queue.__onExceed = onExceed;

        queue.pushItem(1);
        queue.pushItem(2);
        expect(onExceed).not.toHaveBeenCalled();

        queue.pushItem(3);
        expect(onExceed).toHaveBeenCalledWith(1);

        queue.pushItem(4);
        expect(onExceed).toHaveBeenCalledWith(2);
        expect(onExceed).toHaveBeenCalledTimes(2);
    });

    it("should work with a limit of 1", () => {
        const queue = new LimitQueue<number>(1);
        queue.pushItem(10);
        expect(queue.length).toBe(1);
        expect(queue[0]).toBe(10);

        queue.pushItem(20);
        expect(queue.length).toBe(1);
        expect(queue[0]).toBe(20);
    });

    it("should handle objects", () => {
        const queue = new LimitQueue<{ id: number }>(2);
        queue.pushItem({ id: 1 });
        queue.pushItem({ id: 2 });
        queue.pushItem({ id: 3 });

        expect(queue.length).toBe(2);
        expect(queue[0]).toEqual({ id: 2 });
        expect(queue[1]).toEqual({ id: 3 });
    });
});
