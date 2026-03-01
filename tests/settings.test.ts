import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Settings } from "../backend/settings";

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        getCell: vi.fn(),
        findOne: vi.fn(),
        dispense: vi.fn(() => ({})),
        store: vi.fn(),
        getAll: vi.fn(),
    }
}));

import { R } from "redbean-node";

describe("Settings", () => {

    beforeEach(() => {
        // Reset cache between tests
        Settings.cacheList = {};
        Settings.stopCacheCleaner();
        vi.clearAllMocks();
    });

    afterEach(() => {
        Settings.stopCacheCleaner();
    });

    describe("get", () => {
        it("should return parsed JSON value from database", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify("hello"));
            const result = await Settings.get("testKey");
            expect(result).toBe("hello");
        });

        it("should return numeric values", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify(42));
            const result = await Settings.get("port");
            expect(result).toBe(42);
        });

        it("should return boolean values", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify(false));
            const result = await Settings.get("enabled");
            expect(result).toBe(false);
        });

        it("should return object values", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify({ a: 1 }));
            const result = await Settings.get("config");
            expect(result).toEqual({ a: 1 });
        });

        it("should return raw value if JSON parse fails", async () => {
            vi.mocked(R.getCell).mockResolvedValue("not-json");
            const result = await Settings.get("raw");
            expect(result).toBe("not-json");
        });

        it("should cache values after first fetch", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify("cached"));
            await Settings.get("cacheTest");
            await Settings.get("cacheTest");
            // Should only call database once
            expect(R.getCell).toHaveBeenCalledTimes(1);
        });

        it("should return cached value on subsequent calls", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify("first"));
            const first = await Settings.get("key1");
            // Change mock, but cache should still return old value
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify("second"));
            const second = await Settings.get("key1");
            expect(first).toBe("first");
            expect(second).toBe("first");
        });

        it("should return null/undefined from database", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify(null));
            const result = await Settings.get("nullKey");
            expect(result).toBeNull();
        });
    });

    describe("set", () => {
        it("should update existing setting", async () => {
            const bean = { key: "existing",
                value: "",
                type: null } as Record<string, unknown>;
            vi.mocked(R.findOne).mockResolvedValue(bean as never);
            vi.mocked(R.store).mockResolvedValue(undefined as never);

            await Settings.set("existing", "newValue");
            expect(bean.value).toBe(JSON.stringify("newValue"));
            expect(R.store).toHaveBeenCalledWith(bean);
        });

        it("should create new setting if not found", async () => {
            const newBean = { key: "",
                value: "",
                type: null } as Record<string, unknown>;
            vi.mocked(R.findOne).mockResolvedValue(null as never);
            vi.mocked(R.dispense).mockReturnValue(newBean as never);
            vi.mocked(R.store).mockResolvedValue(undefined as never);

            await Settings.set("newKey", "value", "general");
            expect(newBean.key).toBe("newKey");
            expect(newBean.type).toBe("general");
            expect(newBean.value).toBe(JSON.stringify("value"));
        });

        it("should invalidate cache after set", async () => {
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify("old"));
            await Settings.get("myKey");

            vi.mocked(R.findOne).mockResolvedValue(null as never);
            vi.mocked(R.dispense).mockReturnValue({} as never);
            vi.mocked(R.store).mockResolvedValue(undefined as never);
            await Settings.set("myKey", "new");

            // Cache should be cleared, so next get should hit DB
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify("new"));
            const result = await Settings.get("myKey");
            expect(result).toBe("new");
            expect(R.getCell).toHaveBeenCalledTimes(2);
        });

        it("should store boolean values as JSON", async () => {
            const bean = { key: "bool",
                value: "",
                type: null } as Record<string, unknown>;
            vi.mocked(R.findOne).mockResolvedValue(bean as never);
            vi.mocked(R.store).mockResolvedValue(undefined as never);

            await Settings.set("bool", true);
            expect(bean.value).toBe("true");
        });
    });

    describe("getSettings", () => {
        it("should return parsed settings by type", async () => {
            vi.mocked(R.getAll).mockResolvedValue([
                { key: "host",
                    value: JSON.stringify("localhost") },
                { key: "port",
                    value: JSON.stringify(3000) },
            ]);

            const result = await Settings.getSettings("server");
            expect(result.host).toBe("localhost");
            expect(result.port).toBe(3000);
        });

        it("should return raw value if JSON parse fails", async () => {
            vi.mocked(R.getAll).mockResolvedValue([
                { key: "raw",
                    value: "not-json-value" },
            ]);

            const result = await Settings.getSettings("server");
            expect(result.raw).toBe("not-json-value");
        });

        it("should return empty object for no results", async () => {
            vi.mocked(R.getAll).mockResolvedValue([]);
            const result = await Settings.getSettings("nonexistent");
            expect(result).toEqual({});
        });
    });

    describe("deleteCache", () => {
        it("should remove specified keys from cache", async () => {
            Settings.cacheList = {
                a: { value: 1,
                    timestamp: Date.now() },
                b: { value: 2,
                    timestamp: Date.now() },
                c: { value: 3,
                    timestamp: Date.now() },
            };

            Settings.deleteCache([ "a", "c" ]);
            expect(Settings.cacheList).toHaveProperty("b");
            expect(Settings.cacheList).not.toHaveProperty("a");
            expect(Settings.cacheList).not.toHaveProperty("c");
        });

        it("should handle empty key list", () => {
            Settings.cacheList = { x: { value: 1,
                timestamp: Date.now() } };
            Settings.deleteCache([]);
            expect(Settings.cacheList).toHaveProperty("x");
        });

        it("should handle non-existent keys gracefully", () => {
            Settings.cacheList = {};
            expect(() => Settings.deleteCache([ "missing" ])).not.toThrow();
        });
    });

    describe("stopCacheCleaner", () => {
        it("should clear the cache cleaner interval", async () => {
            // Trigger cache cleaner start by calling get
            vi.mocked(R.getCell).mockResolvedValue(JSON.stringify("v"));
            await Settings.get("trigger");
            expect(Settings.cacheCleaner).toBeDefined();

            Settings.stopCacheCleaner();
            expect(Settings.cacheCleaner).toBeUndefined();
        });

        it("should be safe to call when no cleaner is running", () => {
            expect(() => Settings.stopCacheCleaner()).not.toThrow();
            expect(Settings.cacheCleaner).toBeUndefined();
        });
    });
});
