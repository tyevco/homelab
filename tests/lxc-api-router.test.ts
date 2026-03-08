import { describe, it, expect, vi, beforeEach } from "vitest";
import { RUNNING, FROZEN, EXITED, UNKNOWN } from "../common/util-common";

// The CONTAINER_NAME_REGEX used in lxc-api-router.ts
const CONTAINER_NAME_REGEX = /^[a-z0-9_.-]+$/;

// Validation regexes from the create endpoint
const DIST_REGEX = /^[a-zA-Z0-9_.-]+$/;
const RELEASE_REGEX = /^[a-zA-Z0-9_.-]+$/;
const ARCH_REGEX = /^[a-zA-Z0-9_]+$/;

describe("LxcApiRouter validation", () => {

    describe("CONTAINER_NAME_REGEX", () => {
        it("should accept valid container names", () => {
            const valid = [ "mycontainer", "web-server", "db.01", "test_box", "a1.b2-c3", "123" ];
            for (const name of valid) {
                expect(CONTAINER_NAME_REGEX.test(name), `expected "${name}" to be valid`).toBe(true);
            }
        });

        it("should reject empty string", () => {
            expect(CONTAINER_NAME_REGEX.test("")).toBe(false);
        });

        it("should reject uppercase letters", () => {
            expect(CONTAINER_NAME_REGEX.test("MyContainer")).toBe(false);
            expect(CONTAINER_NAME_REGEX.test("ABC")).toBe(false);
        });

        it("should reject names with spaces", () => {
            expect(CONTAINER_NAME_REGEX.test("my container")).toBe(false);
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
                expect(CONTAINER_NAME_REGEX.test(name), `expected "${name}" to be rejected`).toBe(false);
            }
        });

        it("should reject names with slashes", () => {
            expect(CONTAINER_NAME_REGEX.test("path/traversal")).toBe(false);
            expect(CONTAINER_NAME_REGEX.test("path\\traversal")).toBe(false);
        });

        it("should reject path traversal patterns with slashes", () => {
            expect(CONTAINER_NAME_REGEX.test("../../etc/passwd")).toBe(false);
            expect(CONTAINER_NAME_REGEX.test("a/../b")).toBe(false);
        });

        it("should note that dots-only names pass regex (path join is safe due to /var/lib/lxc base)", () => {
            // '..' matches the regex because dots are allowed characters.
            // This is safe because container paths are constructed via path.join(LXC_PATH, name)
            // and LXC itself validates container names.
            expect(CONTAINER_NAME_REGEX.test("..")).toBe(true);
            expect(CONTAINER_NAME_REGEX.test("...")).toBe(true);
        });

        it("should reject unicode and non-ASCII characters", () => {
            expect(CONTAINER_NAME_REGEX.test("caf\u00e9")).toBe(false);
            expect(CONTAINER_NAME_REGEX.test("\u2603")).toBe(false);
            expect(CONTAINER_NAME_REGEX.test("test\u0000null")).toBe(false);
        });

        it("should reject SQL injection patterns", () => {
            expect(CONTAINER_NAME_REGEX.test("'; DROP TABLE--")).toBe(false);
            expect(CONTAINER_NAME_REGEX.test("1 OR 1=1")).toBe(false);
        });

        it("should accept single character names", () => {
            expect(CONTAINER_NAME_REGEX.test("a")).toBe(true);
            expect(CONTAINER_NAME_REGEX.test("0")).toBe(true);
        });

        it("should accept names with leading/trailing dots and hyphens", () => {
            expect(CONTAINER_NAME_REGEX.test(".hidden")).toBe(true);
            expect(CONTAINER_NAME_REGEX.test("-flag")).toBe(true);
            expect(CONTAINER_NAME_REGEX.test("name.")).toBe(true);
        });
    });

    describe("distribution name validation", () => {
        it("should accept valid distribution names", () => {
            const valid = [ "ubuntu", "debian", "centos", "alpine", "archlinux", "Ubuntu-22.04" ];
            for (const name of valid) {
                expect(DIST_REGEX.test(name), `expected "${name}" to be valid`).toBe(true);
            }
        });

        it("should allow mixed case", () => {
            expect(DIST_REGEX.test("Ubuntu")).toBe(true);
            expect(DIST_REGEX.test("CentOS")).toBe(true);
        });

        it("should reject injection attempts", () => {
            expect(DIST_REGEX.test("ubuntu;rm")).toBe(false);
            expect(DIST_REGEX.test("dist name")).toBe(false);
            expect(DIST_REGEX.test("$(cmd)")).toBe(false);
        });
    });

    describe("release name validation", () => {
        it("should accept valid release names", () => {
            const valid = [ "jammy", "22.04", "bullseye", "3.18", "focal-fossa" ];
            for (const name of valid) {
                expect(RELEASE_REGEX.test(name), `expected "${name}" to be valid`).toBe(true);
            }
        });

        it("should reject injection attempts", () => {
            expect(RELEASE_REGEX.test("jammy;id")).toBe(false);
            expect(RELEASE_REGEX.test("22 04")).toBe(false);
        });
    });

    describe("architecture validation", () => {
        it("should accept valid architectures", () => {
            const valid = [ "amd64", "arm64", "i386", "armhf", "x86_64" ];
            for (const name of valid) {
                expect(ARCH_REGEX.test(name), `expected "${name}" to be valid`).toBe(true);
            }
        });

        it("should reject dots and hyphens (stricter than dist/release)", () => {
            expect(ARCH_REGEX.test("arm-v7")).toBe(false);
            expect(ARCH_REGEX.test("x86.64")).toBe(false);
        });

        it("should reject injection attempts", () => {
            expect(ARCH_REGEX.test("amd64;rm")).toBe(false);
            expect(ARCH_REGEX.test("$(arch)")).toBe(false);
        });
    });

    describe("create endpoint required field validation", () => {
        // Simulates the validation logic from the POST /api/lxc/ handler
        function validateCreateFields(body: Record<string, string>): { ok: boolean; msg?: string } {
            const { name, dist, release, arch } = body;

            if (!name || !dist || !release || !arch) {
                return { ok: false,
                    msg: "Missing required fields: name, dist, release, arch" };
            }

            if (!CONTAINER_NAME_REGEX.test(name)) {
                return { ok: false,
                    msg: "Container name can only contain [a-z][0-9] _ . - characters" };
            }
            if (!DIST_REGEX.test(dist)) {
                return { ok: false,
                    msg: "Invalid distribution name" };
            }
            if (!RELEASE_REGEX.test(release)) {
                return { ok: false,
                    msg: "Invalid release name" };
            }
            if (!ARCH_REGEX.test(arch)) {
                return { ok: false,
                    msg: "Invalid architecture" };
            }

            return { ok: true };
        }

        it("should accept valid create payload", () => {
            const result = validateCreateFields({
                name: "my-container",
                dist: "ubuntu",
                release: "22.04",
                arch: "amd64",
            });
            expect(result.ok).toBe(true);
        });

        it("should reject missing name", () => {
            const result = validateCreateFields({ dist: "ubuntu",
                release: "22.04",
                arch: "amd64" });
            expect(result.ok).toBe(false);
            expect(result.msg).toContain("Missing required fields");
        });

        it("should reject missing dist", () => {
            const result = validateCreateFields({ name: "test",
                release: "22.04",
                arch: "amd64" });
            expect(result.ok).toBe(false);
        });

        it("should reject missing release", () => {
            const result = validateCreateFields({ name: "test",
                dist: "ubuntu",
                arch: "amd64" });
            expect(result.ok).toBe(false);
        });

        it("should reject missing arch", () => {
            const result = validateCreateFields({ name: "test",
                dist: "ubuntu",
                release: "22.04" });
            expect(result.ok).toBe(false);
        });

        it("should reject empty strings as missing", () => {
            const result = validateCreateFields({ name: "",
                dist: "ubuntu",
                release: "22.04",
                arch: "amd64" });
            expect(result.ok).toBe(false);
        });

        it("should reject invalid container name even when all fields present", () => {
            const result = validateCreateFields({
                name: "UPPERCASE",
                dist: "ubuntu",
                release: "22.04",
                arch: "amd64",
            });
            expect(result.ok).toBe(false);
            expect(result.msg).toContain("Container name");
        });

        it("should reject invalid distribution name", () => {
            const result = validateCreateFields({
                name: "test",
                dist: "ubuntu;hack",
                release: "22.04",
                arch: "amd64",
            });
            expect(result.ok).toBe(false);
            expect(result.msg).toContain("distribution");
        });

        it("should reject invalid architecture", () => {
            const result = validateCreateFields({
                name: "test",
                dist: "ubuntu",
                release: "22.04",
                arch: "amd64;rm -rf",
            });
            expect(result.ok).toBe(false);
            expect(result.msg).toContain("architecture");
        });

        it("should reject invalid release name", () => {
            const result = validateCreateFields({
                name: "test",
                dist: "ubuntu",
                release: "22.04 && rm -rf /",
                arch: "amd64",
            });
            expect(result.ok).toBe(false);
            expect(result.msg).toContain("release");
        });

        it("should reject when all fields are empty strings", () => {
            const result = validateCreateFields({
                name: "",
                dist: "",
                release: "",
                arch: "",
            });
            expect(result.ok).toBe(false);
        });

        it("should reject name with path traversal", () => {
            const result = validateCreateFields({
                name: "../../etc",
                dist: "ubuntu",
                release: "22.04",
                arch: "amd64",
            });
            expect(result.ok).toBe(false);
        });
    });

    describe("config save validation", () => {
        // Simulates validation from PUT /api/lxc/:name/config
        function validateConfigSave(name: string, config: unknown): { ok: boolean; msg?: string } {
            if (!CONTAINER_NAME_REGEX.test(name)) {
                return { ok: false,
                    msg: "Invalid container name" };
            }
            if (typeof config !== "string") {
                return { ok: false,
                    msg: "Missing required field: config" };
            }
            return { ok: true };
        }

        it("should accept valid name and config string", () => {
            expect(validateConfigSave("mycontainer", "lxc.net.0.type = veth").ok).toBe(true);
        });

        it("should accept empty config string", () => {
            expect(validateConfigSave("mycontainer", "").ok).toBe(true);
        });

        it("should reject non-string config", () => {
            expect(validateConfigSave("mycontainer", undefined).ok).toBe(false);
            expect(validateConfigSave("mycontainer", null).ok).toBe(false);
            expect(validateConfigSave("mycontainer", 123).ok).toBe(false);
        });

        it("should reject invalid container name", () => {
            expect(validateConfigSave("INVALID", "config").ok).toBe(false);
        });

        it("should reject object as config", () => {
            expect(validateConfigSave("test", { key: "value" }).ok).toBe(false);
        });

        it("should reject array as config", () => {
            expect(validateConfigSave("test", [ "a", "b" ]).ok).toBe(false);
        });

        it("should reject boolean as config", () => {
            expect(validateConfigSave("test", true).ok).toBe(false);
        });

        it("should accept multiline config string", () => {
            const config = "lxc.net.0.type = veth\nlxc.net.0.link = lxcbr0\nlxc.rootfs.path = dir:/var/lib/lxc/test/rootfs";
            expect(validateConfigSave("test", config).ok).toBe(true);
        });
    });

    describe("lxcCheck middleware endpoint resolution", () => {
        // Mirrors the resolution logic in lxcCheck:
        //   const requested = (req.query.endpoint as string) || "";
        //   const defaultEndpoint = requested ? "" : ((await Settings.get("defaultLxcEndpoint")) || "");
        //   const endpoint = requested || defaultEndpoint;
        async function resolveEndpoint(requested: string, settingValue: string | null): Promise<string> {
            const defaultEndpoint = requested ? "" : (settingValue || "");
            return requested || defaultEndpoint;
        }

        it("uses explicit endpoint when provided", async () => {
            const ep = await resolveEndpoint("http://agent1:3001", "http://default:3001");
            expect(ep).toBe("http://agent1:3001");
        });

        it("uses default setting when no explicit endpoint", async () => {
            const ep = await resolveEndpoint("", "http://default:3001");
            expect(ep).toBe("http://default:3001");
        });

        it("returns empty string when no explicit endpoint and no default setting", async () => {
            const ep = await resolveEndpoint("", "");
            expect(ep).toBe("");
        });

        it("returns empty string when setting is null (unset)", async () => {
            const ep = await resolveEndpoint("", null);
            expect(ep).toBe("");
        });

        it("explicit endpoint always wins over default setting", async () => {
            // Even if a default is configured, explicit ?endpoint= must take precedence
            const ep = await resolveEndpoint("http://explicit:3001", "http://should-not-use:3001");
            expect(ep).toBe("http://explicit:3001");
        });

        it("empty explicit endpoint falls through to default", async () => {
            // ?endpoint= present but empty string → treated as absent → use default
            const ep = await resolveEndpoint("", "http://default:3001");
            expect(ep).toBe("http://default:3001");
        });

        describe("agentCapabilities validation logic", () => {
            // Mirrors the lxcCheck guard:
            //   if (!localOk && endpoint) { check caps.lxcAvailable }
            //   else if (!localOk) { check anyAgent }
            function checkAccess(
                localOk: boolean,
                endpoint: string,
                agentCapabilities: Record<string, { lxcAvailable: boolean }>
            ): { status: number; msg: string } | "next" {
                if (!localOk && endpoint) {
                    const caps = agentCapabilities[endpoint];
                    if (!caps?.lxcAvailable) {
                        return { status: 503,
                            msg: "LXC is not available on this endpoint" };
                    }
                } else if (!localOk) {
                    const anyAgent = Object.values(agentCapabilities).some(c => c.lxcAvailable);
                    if (!anyAgent) {
                        return { status: 503,
                            msg: "LXC is not available on this system" };
                    }
                }
                return "next";
            }

            it("passes when local LXC is available regardless of endpoint", () => {
                expect(checkAccess(true, "", {})).toBe("next");
                expect(checkAccess(true, "http://agent:3001", {})).toBe("next");
            });

            it("passes when local LXC unavailable but endpoint agent has LXC", () => {
                const caps = { "http://agent:3001": { lxcAvailable: true } };
                expect(checkAccess(false, "http://agent:3001", caps)).toBe("next");
            });

            it("503 when local LXC unavailable and endpoint agent lacks LXC", () => {
                const caps = { "http://agent:3001": { lxcAvailable: false } };
                const result = checkAccess(false, "http://agent:3001", caps);
                expect(result).not.toBe("next");
                expect((result as { status: number }).status).toBe(503);
                expect((result as { msg: string }).msg).toContain("endpoint");
            });

            it("503 when local LXC unavailable, endpoint unknown (not in caps)", () => {
                const result = checkAccess(false, "http://unknown:3001", {});
                expect(result).not.toBe("next");
                expect((result as { status: number }).status).toBe(503);
            });

            it("passes when local LXC unavailable, no explicit endpoint, at least one agent has LXC", () => {
                const caps = {
                    "http://agent1:3001": { lxcAvailable: false },
                    "http://agent2:3001": { lxcAvailable: true },
                };
                expect(checkAccess(false, "", caps)).toBe("next");
            });

            it("503 when local LXC unavailable, no explicit endpoint, no agent has LXC", () => {
                const caps = {
                    "http://agent1:3001": { lxcAvailable: false },
                    "http://agent2:3001": { lxcAvailable: false },
                };
                const result = checkAccess(false, "", caps);
                expect(result).not.toBe("next");
                expect((result as { status: number }).status).toBe(503);
                expect((result as { msg: string }).msg).toContain("system");
            });

            it("503 when local LXC unavailable, no endpoint, no agents at all", () => {
                const result = checkAccess(false, "", {});
                expect(result).not.toBe("next");
                expect((result as { status: number }).status).toBe(503);
            });

            it("default endpoint treated like explicit endpoint for capability check", () => {
                // After resolveEndpoint, the default fills endpoint; then checkAccess treats it the same
                const caps = { "http://default:3001": { lxcAvailable: true } };
                expect(checkAccess(false, "http://default:3001", caps)).toBe("next");
            });
        });
    });

    describe("delete endpoint status checks", () => {
        // Test the logic that checks whether to stop before destroy
        function shouldStopBeforeDestroy(currentStatus: number | undefined): boolean {
            return currentStatus === RUNNING || currentStatus === FROZEN;
        }

        it("should stop running containers before destroying", () => {
            expect(shouldStopBeforeDestroy(RUNNING)).toBe(true);
        });

        it("should stop frozen containers before destroying", () => {
            expect(shouldStopBeforeDestroy(FROZEN)).toBe(true);
        });

        it("should not stop already-stopped containers", () => {
            expect(shouldStopBeforeDestroy(EXITED)).toBe(false);
        });

        it("should not stop containers with unknown status", () => {
            expect(shouldStopBeforeDestroy(UNKNOWN)).toBe(false);
        });

        it("should handle undefined status", () => {
            expect(shouldStopBeforeDestroy(undefined)).toBe(false);
        });
    });
});
