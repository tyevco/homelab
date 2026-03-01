import { describe, it, expect } from "vitest";
import {
    intHash,
    sleep,
    genSecret,
    getCryptoRandomInt,
    statusName,
    statusNameShort,
    statusColor,
    parseDockerPort,
    copyYAMLComments,
    envsubst,
    envsubstYAML,
    getComposeTerminalName,
    getCombinedTerminalName,
    getContainerTerminalName,
    getContainerExecTerminalName,
    getLxcTerminalName,
    getLxcExecTerminalName,
    UNKNOWN,
    CREATED_FILE,
    CREATED_STACK,
    RUNNING,
    EXITED,
    FROZEN,
    ALL_ENDPOINTS,
    TERMINAL_COLS,
    TERMINAL_ROWS,
    acceptedComposeFileNames,
} from "../common/util-common";

describe("util-common", () => {

    describe("ALL_ENDPOINTS constant", () => {
        it("should be the expected placeholder string", () => {
            expect(ALL_ENDPOINTS).toBe("##ALL_HOMELAB_ENDPOINTS##");
        });
    });

    describe("status constants", () => {
        it("should have correct status values", () => {
            expect(UNKNOWN).toBe(0);
            expect(CREATED_FILE).toBe(1);
            expect(CREATED_STACK).toBe(2);
            expect(RUNNING).toBe(3);
            expect(EXITED).toBe(4);
            expect(FROZEN).toBe(5);
        });
    });

    describe("statusName", () => {
        it("should return 'draft' for CREATED_FILE", () => {
            expect(statusName(CREATED_FILE)).toBe("draft");
        });

        it("should return 'running' for RUNNING", () => {
            expect(statusName(RUNNING)).toBe("running");
        });

        it("should return 'exited' for EXITED", () => {
            expect(statusName(EXITED)).toBe("exited");
        });

        it("should return 'frozen' for FROZEN", () => {
            expect(statusName(FROZEN)).toBe("frozen");
        });

        it("should return 'unknown' for unrecognized status", () => {
            expect(statusName(99)).toBe("unknown");
            expect(statusName(UNKNOWN)).toBe("unknown");
        });
    });

    describe("statusNameShort", () => {
        it("should return 'inactive' for CREATED_FILE and CREATED_STACK", () => {
            expect(statusNameShort(CREATED_FILE)).toBe("inactive");
            expect(statusNameShort(CREATED_STACK)).toBe("inactive");
        });

        it("should return 'active' for RUNNING", () => {
            expect(statusNameShort(RUNNING)).toBe("active");
        });

        it("should return 'exited' for EXITED", () => {
            expect(statusNameShort(EXITED)).toBe("exited");
        });

        it("should return '?' for unknown status", () => {
            expect(statusNameShort(99)).toBe("?");
        });
    });

    describe("statusColor", () => {
        it("should return correct colors for each status", () => {
            expect(statusColor(CREATED_FILE)).toBe("dark");
            expect(statusColor(RUNNING)).toBe("primary");
            expect(statusColor(EXITED)).toBe("danger");
            expect(statusColor(FROZEN)).toBe("warning");
            expect(statusColor(99)).toBe("secondary");
        });
    });

    describe("intHash", () => {
        it("should return a number in the default range [0, 9]", () => {
            const result = intHash("test");
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThan(10);
        });

        it("should return a number in custom range", () => {
            const result = intHash("test", 5);
            expect(result).toBeGreaterThanOrEqual(0);
            expect(result).toBeLessThan(5);
        });

        it("should return consistent results for the same input", () => {
            expect(intHash("hello")).toBe(intHash("hello"));
        });

        it("should handle empty string", () => {
            const result = intHash("");
            expect(result).toBe(0);
        });
    });

    describe("sleep", () => {
        it("should resolve after the specified time", async () => {
            const start = Date.now();
            await sleep(50);
            const elapsed = Date.now() - start;
            expect(elapsed).toBeGreaterThanOrEqual(40);
        });
    });

    describe("genSecret", () => {
        it("should generate a string of default length 64", () => {
            const secret = genSecret();
            expect(secret).toHaveLength(64);
        });

        it("should generate a string of custom length", () => {
            const secret = genSecret(16);
            expect(secret).toHaveLength(16);
        });

        it("should only contain alphanumeric characters", () => {
            const secret = genSecret(100);
            expect(secret).toMatch(/^[A-Za-z0-9]+$/);
        });

        it("should generate different secrets each time", () => {
            const a = genSecret();
            const b = genSecret();
            expect(a).not.toBe(b);
        });
    });

    describe("getCryptoRandomInt", () => {
        it("should return an integer within the specified range", () => {
            for (let i = 0; i < 100; i++) {
                const result = getCryptoRandomInt(5, 10);
                expect(result).toBeGreaterThanOrEqual(5);
                expect(result).toBeLessThanOrEqual(10);
            }
        });

        it("should return min when min equals max", () => {
            expect(getCryptoRandomInt(5, 5)).toBe(5);
        });
    });

    describe("parseDockerPort", () => {
        it("should parse a simple port", () => {
            const result = parseDockerPort("3000", "localhost");
            expect(result.url).toBe("http://localhost:3000");
            expect(result.display).toBe("3000");
        });

        it("should parse a port mapping", () => {
            const result = parseDockerPort("8000:8000", "localhost");
            expect(result.url).toBe("http://localhost:8000");
        });

        it("should parse port with IP binding", () => {
            const result = parseDockerPort("127.0.0.1:8001:8001", "localhost");
            expect(result.url).toBe("http://127.0.0.1:8001");
        });

        it("should detect https for port 443", () => {
            const result = parseDockerPort("443:443", "localhost");
            expect(result.url).toBe("https://localhost:443");
        });

        it("should handle udp protocol", () => {
            const result = parseDockerPort("6060:6060/udp", "localhost");
            expect(result.url).toBe("udp://localhost:6060");
        });

        it("should parse docker ps format with arrow", () => {
            const result = parseDockerPort("0.0.0.0:8080->8080/tcp", "localhost");
            // The function splits on -> and takes the host part, but uses the hostname parameter
            // when the format doesn't contain a separate IP binding
            expect(result.url).toBe("http://localhost:8080");
        });

        it("should handle port range", () => {
            const result = parseDockerPort("3000-3005", "localhost");
            expect(result.url).toBe("http://localhost:3000");
        });

        it("should handle host:port range mapping", () => {
            const result = parseDockerPort("9090-9091:8080-8081", "localhost");
            expect(result.url).toBe("http://localhost:9090");
        });
    });

    describe("terminal name helpers", () => {
        it("getComposeTerminalName should concatenate correctly", () => {
            expect(getComposeTerminalName("ep1", "stack1")).toBe("compose-ep1-stack1");
        });

        it("getCombinedTerminalName should concatenate correctly", () => {
            expect(getCombinedTerminalName("ep1", "stack1")).toBe("combined-ep1-stack1");
        });

        it("getContainerTerminalName should concatenate correctly", () => {
            expect(getContainerTerminalName("ep1", "container1")).toBe("container-ep1-container1");
        });

        it("getContainerExecTerminalName should concatenate correctly", () => {
            expect(getContainerExecTerminalName("ep1", "stack1", "container1", 0)).toBe("container-exec-ep1-stack1-container1-0");
        });

        it("getLxcTerminalName should concatenate correctly", () => {
            expect(getLxcTerminalName("ep1", "lxc1")).toBe("lxc-ep1-lxc1");
        });

        it("getLxcExecTerminalName should concatenate correctly", () => {
            expect(getLxcExecTerminalName("ep1", "lxc1", 2)).toBe("lxc-exec-ep1-lxc1-2");
        });
    });

    describe("envsubst", () => {
        it("should replace template variables", () => {
            const result = envsubst("Hello ${NAME}", { NAME: "World" });
            expect(result).toBe("Hello World");
        });

        it("should leave unknown variables in place", () => {
            const result = envsubst("Hello ${UNKNOWN}", {});
            expect(result).toBe("Hello ${UNKNOWN}");
        });
    });

    describe("acceptedComposeFileNames", () => {
        it("should contain expected file names", () => {
            expect(acceptedComposeFileNames).toContain("compose.yaml");
            expect(acceptedComposeFileNames).toContain("docker-compose.yaml");
            expect(acceptedComposeFileNames).toContain("docker-compose.yml");
            expect(acceptedComposeFileNames).toContain("compose.yml");
        });

        it("should have exactly 4 entries", () => {
            expect(acceptedComposeFileNames).toHaveLength(4);
        });
    });

    describe("TERMINAL constants", () => {
        it("should have expected values", () => {
            expect(TERMINAL_COLS).toBe(105);
            expect(TERMINAL_ROWS).toBe(10);
        });
    });
});
