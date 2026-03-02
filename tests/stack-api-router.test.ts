import { describe, it, expect } from "vitest";
import { RUNNING, EXITED, CREATED_FILE, CREATED_STACK, UNKNOWN } from "../common/util-common";
import { statusNumberToString, parseContainerJSON } from "../backend/routers/stack-api-router";

// The STACK_NAME_REGEX used in stack-api-router.ts
const STACK_NAME_REGEX = /^[a-z0-9_-]+$/;

describe("StackApiRouter validation", () => {

    describe("STACK_NAME_REGEX", () => {
        it("should accept valid stack names", () => {
            const valid = [ "mystack", "web-server", "test_box", "a1-b2_c3", "123" ];
            for (const name of valid) {
                expect(STACK_NAME_REGEX.test(name), `expected "${name}" to be valid`).toBe(true);
            }
        });

        it("should reject empty string", () => {
            expect(STACK_NAME_REGEX.test("")).toBe(false);
        });

        it("should reject uppercase letters", () => {
            expect(STACK_NAME_REGEX.test("MyStack")).toBe(false);
            expect(STACK_NAME_REGEX.test("ABC")).toBe(false);
        });

        it("should reject names with spaces", () => {
            expect(STACK_NAME_REGEX.test("my stack")).toBe(false);
        });

        it("should reject command injection attempts", () => {
            const malicious = [
                "test;rm -rf /",
                "test$(whoami)",
                "test`id`",
                "test|cat /etc/passwd",
                "test&&echo pwned",
                "../../../etc/passwd",
                "test\ninjected",
            ];
            for (const name of malicious) {
                expect(STACK_NAME_REGEX.test(name), `expected "${name}" to be rejected`).toBe(false);
            }
        });

        it("should reject names with slashes", () => {
            expect(STACK_NAME_REGEX.test("path/traversal")).toBe(false);
            expect(STACK_NAME_REGEX.test("path\\traversal")).toBe(false);
        });

        it("should reject names with dots (unlike LXC container names)", () => {
            expect(STACK_NAME_REGEX.test("my.stack")).toBe(false);
            expect(STACK_NAME_REGEX.test("..")).toBe(false);
        });

        it("should reject unicode and non-ASCII characters", () => {
            expect(STACK_NAME_REGEX.test("café")).toBe(false);
            expect(STACK_NAME_REGEX.test("☃")).toBe(false);
            expect(STACK_NAME_REGEX.test("test\0null")).toBe(false);
        });

        it("should reject SQL injection patterns", () => {
            expect(STACK_NAME_REGEX.test("'; DROP TABLE--")).toBe(false);
            expect(STACK_NAME_REGEX.test("1 OR 1=1")).toBe(false);
        });

        it("should accept single character names", () => {
            expect(STACK_NAME_REGEX.test("a")).toBe(true);
            expect(STACK_NAME_REGEX.test("0")).toBe(true);
        });

        it("should accept names with leading/trailing hyphens and underscores", () => {
            expect(STACK_NAME_REGEX.test("-flag")).toBe(true);
            expect(STACK_NAME_REGEX.test("_private")).toBe(true);
            expect(STACK_NAME_REGEX.test("name-")).toBe(true);
        });
    });

    describe("statusNumberToString", () => {
        it("should convert RUNNING to 'running'", () => {
            expect(statusNumberToString(RUNNING)).toBe("running");
        });

        it("should convert EXITED to 'exited'", () => {
            expect(statusNumberToString(EXITED)).toBe("exited");
        });

        it("should convert CREATED_FILE to 'created'", () => {
            expect(statusNumberToString(CREATED_FILE)).toBe("created");
        });

        it("should convert CREATED_STACK to 'created'", () => {
            expect(statusNumberToString(CREATED_STACK)).toBe("created");
        });

        it("should convert UNKNOWN to 'unknown'", () => {
            expect(statusNumberToString(UNKNOWN)).toBe("unknown");
        });

        it("should return 'unknown' for unrecognized status numbers", () => {
            expect(statusNumberToString(99)).toBe("unknown");
            expect(statusNumberToString(-1)).toBe("unknown");
        });
    });

    describe("parseContainerJSON", () => {
        it("should parse a single container JSON line", () => {
            const line = JSON.stringify({
                Name: "my-container",
                Service: "web",
                Image: "nginx:latest",
                State: "running",
                Status: "Up 2 hours",
                Health: "healthy",
                Ports: "0.0.0.0:80->80/tcp,0.0.0.0:443->443/tcp",
            });
            const result = parseContainerJSON(line);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("my-container");
            expect(result[0].service).toBe("web");
            expect(result[0].image).toBe("nginx:latest");
            expect(result[0].state).toBe("running");
            expect(result[0].status).toBe("Up 2 hours");
            expect(result[0].health).toBe("healthy");
            expect(result[0].ports).toEqual([ "0.0.0.0:80->80/tcp", "0.0.0.0:443->443/tcp" ]);
        });

        it("should parse multiple container JSON lines", () => {
            const lines = [
                JSON.stringify({
                    Name: "web",
                    Service: "web",
                    Image: "nginx",
                    State: "running",
                    Status: "Up",
                    Health: "",
                    Ports: "80/tcp"
                }),
                JSON.stringify({
                    Name: "db",
                    Service: "db",
                    Image: "postgres",
                    State: "running",
                    Status: "Up",
                    Health: "healthy",
                    Ports: "5432/tcp"
                }),
            ].join("\n");
            const result = parseContainerJSON(lines);
            expect(result).toHaveLength(2);
            expect(result[0].name).toBe("web");
            expect(result[1].name).toBe("db");
        });

        it("should return empty array for empty output", () => {
            expect(parseContainerJSON("")).toEqual([]);
            expect(parseContainerJSON("   ")).toEqual([]);
            expect(parseContainerJSON("\n\n")).toEqual([]);
        });

        it("should skip non-JSON lines gracefully", () => {
            const input = "some warning text\n" + JSON.stringify({
                Name: "web",
                Service: "web",
                Image: "nginx",
                State: "running",
                Status: "Up",
                Health: "",
                Ports: "",
            }) + "\n";
            const result = parseContainerJSON(input);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("web");
        });

        it("should handle missing fields with defaults", () => {
            const line = JSON.stringify({});
            const result = parseContainerJSON(line);
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe("");
            expect(result[0].service).toBe("");
            expect(result[0].image).toBe("");
            expect(result[0].state).toBe("");
            expect(result[0].status).toBe("");
            expect(result[0].health).toBe("");
            expect(result[0].ports).toEqual([]);
        });

        it("should handle containers with no ports", () => {
            const line = JSON.stringify({
                Name: "worker",
                Service: "worker",
                Image: "app",
                State: "running",
                Status: "Up",
                Health: "",
                Ports: "",
            });
            const result = parseContainerJSON(line);
            expect(result).toHaveLength(1);
            expect(result[0].ports).toEqual([]);
        });
    });

    describe("create endpoint required field validation", () => {
        function validateCreateFields(body: Record<string, unknown>): { ok: boolean; message?: string } {
            const { name, composeYaml } = body as { name?: string; composeYaml?: string };

            if (!name || !composeYaml) {
                return { ok: false,
                    message: "Missing required fields: name, composeYaml" };
            }

            if (!STACK_NAME_REGEX.test(name)) {
                return { ok: false,
                    message: "Stack name can only contain [a-z][0-9] _ - characters" };
            }

            return { ok: true };
        }

        it("should accept valid create payload", () => {
            const result = validateCreateFields({
                name: "my-stack",
                composeYaml: "services:\n  web:\n    image: nginx",
            });
            expect(result.ok).toBe(true);
        });

        it("should reject missing name", () => {
            const result = validateCreateFields({ composeYaml: "services:\n  web:\n    image: nginx" });
            expect(result.ok).toBe(false);
            expect(result.message).toContain("Missing required fields");
        });

        it("should reject missing composeYaml", () => {
            const result = validateCreateFields({ name: "test" });
            expect(result.ok).toBe(false);
            expect(result.message).toContain("Missing required fields");
        });

        it("should reject empty strings as missing", () => {
            const result = validateCreateFields({ name: "",
                composeYaml: "services:\n  web:\n    image: nginx" });
            expect(result.ok).toBe(false);
        });

        it("should reject invalid stack name even when all fields present", () => {
            const result = validateCreateFields({
                name: "UPPERCASE",
                composeYaml: "services:\n  web:\n    image: nginx",
            });
            expect(result.ok).toBe(false);
            expect(result.message).toContain("Stack name");
        });

        it("should reject name with path traversal", () => {
            const result = validateCreateFields({
                name: "../../etc",
                composeYaml: "services:\n  web:\n    image: nginx",
            });
            expect(result.ok).toBe(false);
        });
    });
});
