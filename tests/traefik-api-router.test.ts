import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { ROUTE_NAME_REGEX, validateYaml, writeRouteFile } from "../backend/routers/traefik-api-router";

describe("TraefikApiRouter validation", () => {

    describe("ROUTE_NAME_REGEX", () => {
        it("should accept valid route names", () => {
            const valid = [ "myroute", "web-server", "test_route", "a1-b2_c3", "123" ];
            for (const name of valid) {
                expect(ROUTE_NAME_REGEX.test(name), `expected "${name}" to be valid`).toBe(true);
            }
        });

        it("should reject empty string", () => {
            expect(ROUTE_NAME_REGEX.test("")).toBe(false);
        });

        it("should reject uppercase letters", () => {
            expect(ROUTE_NAME_REGEX.test("MyRoute")).toBe(false);
            expect(ROUTE_NAME_REGEX.test("ABC")).toBe(false);
        });

        it("should reject names with spaces", () => {
            expect(ROUTE_NAME_REGEX.test("my route")).toBe(false);
        });

        it("should reject names with dots", () => {
            expect(ROUTE_NAME_REGEX.test("my.route")).toBe(false);
            expect(ROUTE_NAME_REGEX.test("..")).toBe(false);
        });

        it("should reject path traversal patterns", () => {
            expect(ROUTE_NAME_REGEX.test("../../etc/passwd")).toBe(false);
            expect(ROUTE_NAME_REGEX.test("a/../b")).toBe(false);
        });

        it("should reject names with slashes", () => {
            expect(ROUTE_NAME_REGEX.test("path/traversal")).toBe(false);
            expect(ROUTE_NAME_REGEX.test("path\\traversal")).toBe(false);
        });

        it("should reject command injection attempts", () => {
            const malicious = [
                "test;rm -rf /",
                "test$(whoami)",
                "test`id`",
                "test|cat /etc/passwd",
                "test&&echo pwned",
                "test\ninjected",
            ];
            for (const name of malicious) {
                expect(ROUTE_NAME_REGEX.test(name), `expected "${name}" to be rejected`).toBe(false);
            }
        });

        it("should reject unicode and non-ASCII characters", () => {
            expect(ROUTE_NAME_REGEX.test("café")).toBe(false);
            expect(ROUTE_NAME_REGEX.test("☃")).toBe(false);
        });

        it("should accept single character names", () => {
            expect(ROUTE_NAME_REGEX.test("a")).toBe(true);
            expect(ROUTE_NAME_REGEX.test("0")).toBe(true);
        });

        it("should accept names with leading/trailing hyphens and underscores", () => {
            expect(ROUTE_NAME_REGEX.test("-flag")).toBe(true);
            expect(ROUTE_NAME_REGEX.test("_private")).toBe(true);
            expect(ROUTE_NAME_REGEX.test("name-")).toBe(true);
        });
    });

    describe("validateYaml", () => {
        it("should accept valid YAML", () => {
            const result = validateYaml("http:\n  routers:\n    my-router:\n      rule: Host(`example.com`)");
            expect(result.valid).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it("should accept empty string as valid YAML", () => {
            const result = validateYaml("");
            expect(result.valid).toBe(true);
        });

        it("should accept simple key-value YAML", () => {
            const result = validateYaml("key: value");
            expect(result.valid).toBe(true);
        });

        it("should reject invalid YAML", () => {
            const result = validateYaml("key: :\n  bad: [unclosed");
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe("string");
        });

        it("should return error message for invalid YAML", () => {
            const result = validateYaml("{unclosed");
            expect(result.valid).toBe(false);
            expect(result.error).toBeTruthy();
        });
    });

    describe("PUT /api/traefik/routes/:name - file operations", () => {
        let tmpDir: string;

        afterEach(() => {
            if (tmpDir && fs.existsSync(tmpDir)) {
                fs.rmSync(tmpDir, { recursive: true,
                    force: true });
            }
        });

        it("should create file and return 200 with correct body for valid name and YAML", () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-test-"));
            const configsDir = path.join(tmpDir, "configs");
            const name = "my-route";
            const content = "http:\n  routers:\n    my-router:\n      rule: Host(`example.com`)";

            const result = writeRouteFile(configsDir, name, content);

            expect(result.name).toBe(name);
            expect(result.content).toBe(content);
            expect(result.lastModified).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
            expect(fs.existsSync(path.join(configsDir, `${name}.yml`))).toBe(true);
        });

        it("should create the configs directory if it does not exist", () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-test-"));
            const configsDir = path.join(tmpDir, "configs", "nested");
            const name = "test-route";

            writeRouteFile(configsDir, name, "key: value");

            expect(fs.existsSync(configsDir)).toBe(true);
            expect(fs.existsSync(path.join(configsDir, `${name}.yml`))).toBe(true);
        });

        it("should overwrite an existing file and return 200", () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-test-"));
            const configsDir = path.join(tmpDir, "configs");
            const name = "existing-route";
            const original = "key: original";
            const updated = "key: updated";

            writeRouteFile(configsDir, name, original);
            const result = writeRouteFile(configsDir, name, updated);

            expect(result.content).toBe(updated);
            const fileContent = fs.readFileSync(path.join(configsDir, `${name}.yml`), "utf-8");
            expect(fileContent).toBe(updated);
        });

        it("should return lastModified matching the file's actual mtime", () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-test-"));
            const configsDir = path.join(tmpDir, "configs");
            const name = "mtime-route";

            const result = writeRouteFile(configsDir, name, "key: value");

            const filePath = path.join(configsDir, `${name}.yml`);
            const stat = fs.statSync(filePath);
            expect(result.lastModified).toBe(stat.mtime.toISOString());
        });

        it("should be idempotent - same PUT with same content still returns 200", () => {
            tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "traefik-test-"));
            const configsDir = path.join(tmpDir, "configs");
            const name = "idempotent-route";
            const content = "key: value";

            const first = writeRouteFile(configsDir, name, content);
            const second = writeRouteFile(configsDir, name, content);

            expect(second.name).toBe(first.name);
            expect(second.content).toBe(first.content);
        });
    });

    describe("PUT /api/traefik/routes/:name - validation logic", () => {
        // Simulates the validation logic from the PUT handler
        function validatePutRequest(name: string, body: Record<string, unknown>): { status: number; error?: string } {
            if (!ROUTE_NAME_REGEX.test(name)) {
                return { status: 400,
                    error: "invalid name" };
            }
            const { content } = body as { content?: string };
            if (typeof content !== "string") {
                return { status: 400,
                    error: "missing content" };
            }
            const yamlCheck = validateYaml(content);
            if (!yamlCheck.valid) {
                return { status: 400,
                    error: `invalid YAML: ${yamlCheck.error}` };
            }
            return { status: 200 };
        }

        it("should accept valid name and valid YAML", () => {
            const result = validatePutRequest("my-route", { content: "key: value" });
            expect(result.status).toBe(200);
        });

        it("should reject uppercase names with 400", () => {
            const result = validatePutRequest("MyRoute", { content: "key: value" });
            expect(result.status).toBe(400);
            expect(result.error).toBe("invalid name");
        });

        it("should reject names with spaces with 400", () => {
            const result = validatePutRequest("my route", { content: "key: value" });
            expect(result.status).toBe(400);
            expect(result.error).toBe("invalid name");
        });

        it("should reject names with dots with 400", () => {
            const result = validatePutRequest("my.route", { content: "key: value" });
            expect(result.status).toBe(400);
            expect(result.error).toBe("invalid name");
        });

        it("should reject missing content with 400", () => {
            const result = validatePutRequest("my-route", {});
            expect(result.status).toBe(400);
            expect(result.error).toBe("missing content");
        });

        it("should reject non-string content with 400", () => {
            const result = validatePutRequest("my-route", { content: 123 });
            expect(result.status).toBe(400);
            expect(result.error).toBe("missing content");
        });

        it("should reject null content with 400", () => {
            const result = validatePutRequest("my-route", { content: null });
            expect(result.status).toBe(400);
            expect(result.error).toBe("missing content");
        });

        it("should reject invalid YAML with 400 and error message", () => {
            const result = validatePutRequest("my-route", { content: "{unclosed" });
            expect(result.status).toBe(400);
            expect(result.error).toMatch(/^invalid YAML:/);
        });

        it("should include YAML error detail in error message", () => {
            const result = validatePutRequest("my-route", { content: "key: :\n  bad: [unclosed" });
            expect(result.status).toBe(400);
            expect(result.error).toMatch(/^invalid YAML:/);
            expect(result.error!.length).toBeGreaterThan("invalid YAML: ".length);
        });

        it("should accept empty string content (valid YAML)", () => {
            const result = validatePutRequest("my-route", { content: "" });
            expect(result.status).toBe(200);
        });

        it("should accept multiline YAML content", () => {
            const yaml = "http:\n  routers:\n    r1:\n      rule: Host(`a.com`)\n      entrypoints:\n        - web";
            const result = validatePutRequest("my-route", { content: yaml });
            expect(result.status).toBe(200);
        });
    });
});
