import { describe, it, expect } from "vitest";
import { Stack } from "../backend/stack";
import { ValidationError } from "../backend/util-server";
import type { HomelabServer } from "../backend/homelab-server";

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
    });
});
