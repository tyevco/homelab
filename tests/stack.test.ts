import { describe, it, expect, vi, beforeEach } from "vitest";
import { Stack } from "../backend/stack";
import { ValidationError } from "../backend/util-server";
import { CREATED_STACK, EXITED, RUNNING, UNKNOWN } from "../common/util-common";
import type { HomelabServer } from "../backend/homelab-server";

vi.mock("promisify-child-process", () => ({
    default: {
        spawn: vi.fn(),
    },
}));

import childProcessAsync from "promisify-child-process";

const mockServer = { stacksDir: "/tmp/stacks" } as HomelabServer;

describe("Stack", () => {

    describe("validate", () => {
        it("should accept valid stack names", () => {
            const valid = [ "my-stack", "web_app", "stack1", "a-b-c", "test123" ];
            for (const name of valid) {
                const stack = new Stack(mockServer, name, "version: '3'\n", "", true);
                expect(() => stack.validate(), `expected "${name}" to be valid`).not.toThrow();
            }
        });

        it("should reject uppercase stack names", () => {
            const stack = new Stack(mockServer, "MyStack", "version: '3'\n", "", true);
            expect(() => stack.validate()).toThrow(ValidationError);
        });

        it("should reject stack names with dots", () => {
            const stack = new Stack(mockServer, "my.stack", "version: '3'\n", "", true);
            expect(() => stack.validate()).toThrow(ValidationError);
        });

        it("should reject stack names with spaces", () => {
            const stack = new Stack(mockServer, "my stack", "version: '3'\n", "", true);
            expect(() => stack.validate()).toThrow(ValidationError);
        });

        it("should reject stack names with special characters", () => {
            const malicious = [ "test;rm", "$(cmd)", "test`id`", "a/b", "a\\b" ];
            for (const name of malicious) {
                const stack = new Stack(mockServer, name, "version: '3'\n", "", true);
                expect(() => stack.validate(), `expected "${name}" to be rejected`).toThrow(ValidationError);
            }
        });

        it("should reject empty stack name", () => {
            const stack = new Stack(mockServer, "", "version: '3'\n", "", true);
            expect(() => stack.validate()).toThrow(ValidationError);
        });

        it("should reject invalid YAML", () => {
            const stack = new Stack(mockServer, "valid-name", "{{invalid yaml", "", true);
            expect(() => stack.validate()).toThrow();
        });

        it("should accept valid YAML", () => {
            const yaml = "services:\n  web:\n    image: nginx\n";
            const stack = new Stack(mockServer, "valid-name", yaml, "", true);
            expect(() => stack.validate()).not.toThrow();
        });

        it("should accept empty .env", () => {
            const stack = new Stack(mockServer, "valid-name", "version: '3'\n", "", true);
            expect(() => stack.validate()).not.toThrow();
        });

        it("should reject single-line .env without equals sign", () => {
            const stack = new Stack(mockServer, "valid-name", "version: '3'\n", "INVALID_LINE", true);
            expect(() => stack.validate()).toThrow(ValidationError);
        });

        it("should accept valid .env with equals sign", () => {
            const stack = new Stack(mockServer, "valid-name", "version: '3'\n", "KEY=value", true);
            expect(() => stack.validate()).not.toThrow();
        });

        it("should accept multi-line .env even without equals on some lines", () => {
            const stack = new Stack(mockServer, "valid-name", "version: '3'\n", "KEY=value\nCOMMENT", true);
            expect(() => stack.validate()).not.toThrow();
        });
    });

    describe("toSimpleJSON", () => {
        it("should return correct structure", () => {
            const stack = new Stack(mockServer, "test-stack", "version: '3'\n", "", true);
            const json = stack.toSimpleJSON("ep1") as Record<string, unknown>;
            expect(json.name).toBe("test-stack");
            expect(json.endpoint).toBe("ep1");
            expect(json.tags).toEqual([]);
            expect(json.composeFileName).toBe("compose.yaml");
        });

        it("should reflect non-default composeFileName", () => {
            const stack = new Stack(mockServer, "test-stack", "version: '3'\n", "", true);
            // Force non-default compose file name
            (stack as unknown as Record<string, string>)["_composeFileName"] = "docker-compose.yml";
            const json = stack.toSimpleJSON("ep1") as Record<string, unknown>;
            expect(json.composeFileName).toBe("docker-compose.yml");
        });

        it("should reflect current status", () => {
            const stack = new Stack(mockServer, "running-stack", "version: '3'\n", "", true);
            (stack as unknown as Record<string, number>)["_status"] = RUNNING;
            const json = stack.toSimpleJSON("") as Record<string, unknown>;
            expect(json.status).toBe(RUNNING);
        });

        it("should default status to UNKNOWN", () => {
            const stack = new Stack(mockServer, "new-stack", "version: '3'\n", "", true);
            const json = stack.toSimpleJSON("") as Record<string, unknown>;
            expect(json.status).toBe(UNKNOWN);
        });
    });

    describe("statusConvert", () => {
        it("should convert 'created' to CREATED_STACK", () => {
            expect(Stack.statusConvert("created(1)")).toBe(CREATED_STACK);
        });

        it("should convert 'running' to RUNNING", () => {
            expect(Stack.statusConvert("running(2)")).toBe(RUNNING);
        });

        it("should convert 'exited' to EXITED", () => {
            expect(Stack.statusConvert("exited(1)")).toBe(EXITED);
        });

        it("should prioritize exited over running in mixed status", () => {
            expect(Stack.statusConvert("exited(1), running(1)")).toBe(EXITED);
        });

        it("should return UNKNOWN for unrecognized status", () => {
            expect(Stack.statusConvert("paused(1)")).toBe(UNKNOWN);
            expect(Stack.statusConvert("")).toBe(UNKNOWN);
        });
    });

    describe("path", () => {
        it("should join stacksDir with name", () => {
            const stack = new Stack(mockServer, "my-stack", "", "", true);
            // path.join normalizes separators
            expect(stack.path).toContain("my-stack");
            expect(stack.path).toContain("stacks");
        });
    });

    describe("ps", () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("should return empty object when stdout is empty", async () => {
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({ stdout: "" } as never);
            const stack = new Stack(mockServer, "test-stack", "", "", true);
            const result = await stack.ps();
            expect(result).toEqual({});
        });

        it("should return empty object when stdout is null", async () => {
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({ stdout: null } as never);
            const stack = new Stack(mockServer, "test-stack", "", "", true);
            const result = await stack.ps();
            expect(result).toEqual({});
        });

        it("should parse valid JSON stdout", async () => {
            const psOutput = [{
                Name: "web",
                State: "running",
            }];
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({
                stdout: JSON.stringify(psOutput),
            } as never);
            const stack = new Stack(mockServer, "test-stack", "", "", true);
            const result = await stack.ps();
            expect(result).toEqual(psOutput);
        });

        it("should return empty object for malformed JSON stdout", async () => {
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({
                stdout: "not valid json{{{",
            } as never);
            const stack = new Stack(mockServer, "test-stack", "", "", true);
            const result = await stack.ps();
            expect(result).toEqual({});
        });
    });

    describe("getStatusList", () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it("should return empty map when stdout is empty", async () => {
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({ stdout: "" } as never);
            const result = await Stack.getStatusList();
            expect(result.size).toBe(0);
        });

        it("should parse valid compose ls output", async () => {
            const lsOutput = [
                {
                    Name: "web-app",
                    Status: "running(1)",
                },
                {
                    Name: "db",
                    Status: "exited(1)",
                },
            ];
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({
                stdout: JSON.stringify(lsOutput),
            } as never);
            const result = await Stack.getStatusList();
            expect(result.get("web-app")).toBe(RUNNING);
            expect(result.get("db")).toBe(EXITED);
        });

        it("should return empty map for malformed JSON", async () => {
            vi.mocked(childProcessAsync.spawn).mockResolvedValue({
                stdout: "invalid json!!!",
            } as never);
            const result = await Stack.getStatusList();
            expect(result.size).toBe(0);
        });
    });
});
