import { describe, it, expect, vi, beforeEach } from "vitest";
import { Database } from "../backend/database";
import fs from "fs";
import path from "path";

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        setup: vi.fn(),
        freeze: vi.fn(),
        debug: vi.fn(),
        autoloadModels: vi.fn(),
        exec: vi.fn(),
        getAll: vi.fn().mockResolvedValue([]),
        getCell: vi.fn().mockResolvedValue("3.39.0"),
        close: vi.fn().mockResolvedValue(undefined),
        knex: {
            migrate: {
                latest: vi.fn().mockResolvedValue(undefined),
            },
        },
    }
}));

// Mock knex
vi.mock("knex", () => ({
    default: vi.fn(() => ({})),
}));

// Mock sqlite dialect
vi.mock("knex/lib/dialects/sqlite3/index.js", () => ({
    default: { prototype: { _driver: null } },
}));

// Mock sqlite3
vi.mock("@louislam/sqlite3", () => ({
    default: {},
}));

describe("Database", () => {

    describe("readDBConfig", () => {
        it("should throw for non-object config", () => {
            // Set up the server config path
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/tmp/test-data" } };

            vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify("just a string"));
            expect(() => Database.readDBConfig()).toThrow("it must be an object");
        });

        it("should throw for missing type field", () => {
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/tmp/test-data" } };

            vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ hostname: "localhost" }));
            expect(() => Database.readDBConfig()).toThrow("type must be a string");
        });

        it("should return valid config", () => {
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/tmp/test-data" } };

            const config = { type: "sqlite" };
            vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(config));
            expect(Database.readDBConfig()).toEqual(config);
        });

        it("should throw when file does not exist", () => {
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/nonexistent" } };

            vi.spyOn(fs, "readFileSync").mockImplementation(() => {
                throw new Error("ENOENT");
            });
            expect(() => Database.readDBConfig()).toThrow("ENOENT");
        });

        it("should throw for invalid JSON", () => {
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/tmp/test-data" } };

            vi.spyOn(fs, "readFileSync").mockReturnValue("{invalid json}");
            expect(() => Database.readDBConfig()).toThrow();
        });

        it("should throw for array config", () => {
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/tmp/test-data" } };

            vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify([ 1, 2, 3 ]));
            // Arrays are objects in JS, so type check passes, but type field check fails
            expect(() => Database.readDBConfig()).toThrow("type must be a string");
        });

        it("should throw for numeric type field", () => {
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/tmp/test-data" } };

            vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify({ type: 123 }));
            expect(() => Database.readDBConfig()).toThrow("type must be a string");
        });
    });

    describe("writeDBConfig", () => {
        it("should write config as formatted JSON", () => {
            const serverRef = Database as unknown as Record<string, Record<string, Record<string, string>>>;
            serverRef["server"] = { config: { dataDir: "/tmp/test-data" } };

            const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation(() => {});
            const config = { type: "sqlite" as const };
            Database.writeDBConfig(config);

            expect(writeSpy).toHaveBeenCalledWith(
                path.join("/tmp/test-data", "db-config.json"),
                JSON.stringify(config, null, 4)
            );
        });
    });

    describe("getSize", () => {
        it("should return file size for sqlite", () => {
            Database.dbConfig = { type: "sqlite" };
            Database.sqlitePath = "/tmp/test.db";

            vi.spyOn(fs, "statSync").mockReturnValue({ size: 1024 } as fs.Stats);
            expect(Database.getSize()).toBe(1024);
        });

        it("should return 0 for non-sqlite database", () => {
            Database.dbConfig = { type: "mysql" };
            expect(Database.getSize()).toBe(0);
        });

        it("should return 0 for undefined type", () => {
            Database.dbConfig = {};
            expect(Database.getSize()).toBe(0);
        });
    });

    describe("static properties", () => {
        it("should have default knexMigrationsPath", () => {
            expect(Database.knexMigrationsPath).toBe("./backend/migrations");
        });

        it("should default noReject to true", () => {
            expect(Database.noReject).toBe(true);
        });
    });

    describe("patch", () => {
        it("should run migrations", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.knex.migrate.latest).mockResolvedValue(undefined as never);
            await expect(Database.patch()).resolves.toBeUndefined();
        });

        it("should handle missing migration files gracefully", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.knex.migrate.latest).mockRejectedValue(
                new Error("the following files are missing: 001.ts") as never
            );
            // Should not throw
            await expect(Database.patch()).resolves.toBeUndefined();
        });

        it("should rethrow non-missing-file migration errors", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.knex.migrate.latest).mockRejectedValue(
                new Error("connection refused") as never
            );
            await expect(Database.patch()).rejects.toThrow("connection refused");
        });
    });

    describe("shrink", () => {
        it("should run VACUUM for sqlite", async () => {
            const { R } = await import("redbean-node");
            Database.dbConfig = { type: "sqlite" };
            await Database.shrink();
            expect(R.exec).toHaveBeenCalledWith("VACUUM");
        });

        it("should be no-op for non-sqlite", async () => {
            const { R } = await import("redbean-node");
            vi.mocked(R.exec).mockClear();
            Database.dbConfig = { type: "mysql" };
            await Database.shrink();
            expect(R.exec).not.toHaveBeenCalled();
        });
    });
});
