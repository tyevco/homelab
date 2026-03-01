import { describe, it, expect, vi, beforeEach } from "vitest";
import { LxcContainer } from "../backend/lxc-container";
import { UNKNOWN, RUNNING, EXITED, FROZEN, STACK_TYPE_LXC } from "../common/util-common";
import type { HomelabServer } from "../backend/homelab-server";

// Minimal mock server for constructing LxcContainer instances
const mockServer = {} as HomelabServer;

// Helper to access private properties in tests
function internals(container: LxcContainer): Record<string, unknown> {
    return container as unknown as Record<string, unknown>;
}

describe("LxcContainer", () => {

    describe("statusConvert", () => {
        it("should convert RUNNING to RUNNING constant", () => {
            expect(LxcContainer.statusConvert("RUNNING")).toBe(RUNNING);
        });

        it("should convert STOPPED to EXITED constant", () => {
            expect(LxcContainer.statusConvert("STOPPED")).toBe(EXITED);
        });

        it("should convert FROZEN to FROZEN constant", () => {
            expect(LxcContainer.statusConvert("FROZEN")).toBe(FROZEN);
        });

        it("should return UNKNOWN for unrecognized state", () => {
            expect(LxcContainer.statusConvert("PAUSED")).toBe(UNKNOWN);
            expect(LxcContainer.statusConvert("")).toBe(UNKNOWN);
        });

        it("should be case-insensitive", () => {
            expect(LxcContainer.statusConvert("running")).toBe(RUNNING);
            expect(LxcContainer.statusConvert("Stopped")).toBe(EXITED);
            expect(LxcContainer.statusConvert("frozen")).toBe(FROZEN);
        });

        it("should trim whitespace", () => {
            expect(LxcContainer.statusConvert("  RUNNING  ")).toBe(RUNNING);
            expect(LxcContainer.statusConvert("STOPPED\n")).toBe(EXITED);
        });
    });

    describe("parseLxcLsOutput", () => {
        it("should return empty array for empty input", () => {
            expect(LxcContainer.parseLxcLsOutput("")).toEqual([]);
        });

        it("should return empty array for header-only input", () => {
            expect(LxcContainer.parseLxcLsOutput("NAME  STATE\n")).toEqual([]);
        });

        it("should parse single container output", () => {
            const output =
                "NAME       STATE    IPV4        AUTOSTART  PID    MEMORY\n" +
                "test1      RUNNING  10.0.3.1    1          1234   64.00 MiB\n";

            const result = LxcContainer.parseLxcLsOutput(output);
            expect(result).toHaveLength(1);
            expect(result[0]["name"]).toBe("test1");
            expect(result[0]["state"]).toBe("RUNNING");
            expect(result[0]["autostart"]).toBe("1");
        });

        it("should parse multiple containers", () => {
            const output =
                "NAME       STATE    IPV4        AUTOSTART  PID    MEMORY\n" +
                "web1       RUNNING  10.0.3.1    1          1234   64.00 MiB\n" +
                "db1        STOPPED  -           0          -1     0\n";

            const result = LxcContainer.parseLxcLsOutput(output);
            expect(result).toHaveLength(2);
            expect(result[0]["name"]).toBe("web1");
            expect(result[1]["name"]).toBe("db1");
            expect(result[1]["state"]).toBe("STOPPED");
        });

        it("should skip separator lines", () => {
            const output =
                "NAME       STATE\n" +
                "----------\n" +
                "test1      RUNNING\n";

            const result = LxcContainer.parseLxcLsOutput(output);
            expect(result).toHaveLength(1);
            expect(result[0]["name"]).toBe("test1");
        });

        it("should skip empty lines", () => {
            const output =
                "NAME       STATE\n" +
                "\n" +
                "test1      RUNNING\n" +
                "\n";

            const result = LxcContainer.parseLxcLsOutput(output);
            expect(result).toHaveLength(1);
        });

        it("should handle name-and-state only columns", () => {
            const output =
                "NAME       STATE\n" +
                "mybox      FROZEN\n";

            const result = LxcContainer.parseLxcLsOutput(output);
            expect(result).toHaveLength(1);
            expect(result[0]["name"]).toBe("mybox");
            expect(result[0]["state"]).toBe("FROZEN");
        });
    });

    describe("toJSON", () => {
        it("should return correct JSON structure with defaults", () => {
            const container = new LxcContainer(mockServer, "test-container");

            // Access the toJSON method - need to set _config to avoid file read
            internals(container)._config = "lxc.net.0.type = veth";

            const json = container.toJSON("ep1") as Record<string, unknown>;
            expect(json.name).toBe("test-container");
            expect(json.status).toBe(UNKNOWN);
            expect(json.type).toBe(STACK_TYPE_LXC);
            expect(json.tags).toEqual([]);
            expect(json.endpoint).toBe("ep1");
            expect(json.ip).toBe("");
            expect(json.autostart).toBe(false);
            expect(json.pid).toBe(0);
            expect(json.memory).toBe("");
            expect(json.config).toBe("lxc.net.0.type = veth");
        });

        it("should include populated fields", () => {
            const container = new LxcContainer(mockServer, "web-server");
            internals(container)._status = RUNNING;
            internals(container)._ip = "10.0.3.5";
            internals(container)._autostart = true;
            internals(container)._pid = 5678;
            internals(container)._memory = "128.00 MiB";
            internals(container)._config = "";

            const json = container.toJSON("agent1") as Record<string, unknown>;
            expect(json.name).toBe("web-server");
            expect(json.status).toBe(RUNNING);
            expect(json.ip).toBe("10.0.3.5");
            expect(json.autostart).toBe(true);
            expect(json.pid).toBe(5678);
            expect(json.memory).toBe("128.00 MiB");
            expect(json.endpoint).toBe("agent1");
        });
    });

    describe("toSimpleJSON", () => {
        it("should return simplified JSON structure", () => {
            const container = new LxcContainer(mockServer, "simple-test");
            internals(container)._status = EXITED;

            const json = container.toSimpleJSON("ep2") as Record<string, unknown>;
            expect(json.name).toBe("simple-test");
            expect(json.status).toBe(EXITED);
            expect(json.type).toBe(STACK_TYPE_LXC);
            expect(json.tags).toEqual([]);
            expect(json.endpoint).toBe("ep2");
            expect(json.isManagedByHomelab).toBe(true);
            // Should NOT have detailed fields
            expect(json.ip).toBeUndefined();
            expect(json.config).toBeUndefined();
            expect(json.pid).toBeUndefined();
        });
    });

    describe("path getter", () => {
        it("should return the correct LXC path", () => {
            const container = new LxcContainer(mockServer, "mycontainer");
            // On Windows the path.join will use backslashes, on Linux forward slashes
            expect(container.path).toContain("mycontainer");
            expect(container.path).toContain("lxc");
        });
    });

    describe("container name validation patterns", () => {
        // The CONTAINER_NAME_REGEX used in the router: /^[a-z0-9_.-]+$/
        const routerRegex = /^[a-z0-9_.-]+$/;
        // The regex used in LxcContainer.getContainer: /^[a-zA-Z0-9_.-]+$/
        const getContainerRegex = /^[a-zA-Z0-9_.-]+$/;
        // The regex used in LxcContainer.create: /^[a-z0-9_.-]+$/
        const createRegex = /^[a-z0-9_.-]+$/;

        it("should accept valid lowercase names", () => {
            const validNames = [ "mycontainer", "web-server", "db.01", "test_box", "a1.b2-c3" ];
            for (const name of validNames) {
                expect(routerRegex.test(name)).toBe(true);
                expect(getContainerRegex.test(name)).toBe(true);
                expect(createRegex.test(name)).toBe(true);
            }
        });

        it("should reject empty names", () => {
            expect(routerRegex.test("")).toBe(false);
            expect(getContainerRegex.test("")).toBe(false);
        });

        it("should reject names with spaces", () => {
            expect(routerRegex.test("my container")).toBe(false);
            expect(getContainerRegex.test("my container")).toBe(false);
        });

        it("should reject names with special characters", () => {
            const invalidNames = [ "my@container", "test!", "name/path", "container;rm", "$(cmd)" ];
            for (const name of invalidNames) {
                expect(routerRegex.test(name)).toBe(false);
                expect(getContainerRegex.test(name)).toBe(false);
            }
        });

        it("router regex should reject uppercase (create path is lowercase-only)", () => {
            expect(routerRegex.test("MyContainer")).toBe(false);
            expect(createRegex.test("MyContainer")).toBe(false);
        });

        it("getContainer regex allows uppercase for querying existing containers", () => {
            expect(getContainerRegex.test("MyContainer")).toBe(true);
        });
    });
});
