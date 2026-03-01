import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");

/**
 * Rebrand verification tests.
 * Ensures that no old "Dockge" / "dockge" / "DOCKGE" references remain
 * in the codebase (excluding expected third-party dependencies).
 */
describe("rebrand verification", () => {

    /**
     * Searches the codebase for the given pattern, excluding files that
     * legitimately contain the old name (third-party package references).
     */
    function grepForOldName(pattern: string, caseInsensitive = false): string[] {
        const flag = caseInsensitive ? "-rli" : "-rl";
        try {
            const result = execSync(
                `grep ${flag} "${pattern}" --exclude-dir=node_modules --exclude-dir=.git --include="*.ts" --include="*.vue" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.go" --include="*.md" --include="*.js" --include="*.html" .`,
                { cwd: ROOT_DIR,
                    encoding: "utf-8",
                    timeout: 30000 }
            );
            return result
                .trim()
                .split("\n")
                .filter(Boolean)
                // Exclude package-lock.json (third-party dependency names like @louislam/sqlite3)
                .filter(f => !f.includes("package-lock.json"))
                // Exclude the rebrand test file itself
                .filter(f => !f.includes("rebrand.test.ts"));
        } catch {
            // grep returns exit code 1 when no matches found
            return [];
        }
    }

    it("should have no 'dockge' references in source files (case-insensitive)", { timeout: 30000 }, () => {
        const files = grepForOldName("dockge", true);
        expect(files, `Found old "dockge" references in: ${files.join(", ")}`).toEqual([]);
    });

    it("should have no 'DockgeServer' class references", () => {
        const files = grepForOldName("DockgeServer");
        expect(files, `Found old "DockgeServer" references in: ${files.join(", ")}`).toEqual([]);
    });

    it("should have no 'DockgeSocket' type references", () => {
        const files = grepForOldName("DockgeSocket");
        expect(files, `Found old "DockgeSocket" references in: ${files.join(", ")}`).toEqual([]);
    });

    it("should have no 'DOCKGE_' environment variable references", () => {
        const files = grepForOldName("DOCKGE_");
        expect(files, `Found old "DOCKGE_" env var references in: ${files.join(", ")}`).toEqual([]);
    });

    it("should have no 'louislam/dockge' references", () => {
        const files = grepForOldName("louislam/dockge");
        expect(files, `Found old "louislam/dockge" references in: ${files.join(", ")}`).toEqual([]);
    });

    it("should have no old dockge-server.ts file import references", () => {
        const files = grepForOldName("dockge-server");
        expect(files, `Found old "dockge-server" import references in: ${files.join(", ")}`).toEqual([]);
    });

    it("should use HomelabServer as the server class name", () => {
        try {
            execSync(
                "grep -r \"HomelabServer\" --exclude-dir=node_modules --exclude-dir=.git --include=\"*.ts\" -l .",
                { cwd: ROOT_DIR,
                    encoding: "utf-8",
                    timeout: 30000 }
            );
        } catch {
            expect.fail("HomelabServer class not found in codebase");
        }
    });

    it("should use HomelabSocket as the socket interface name", () => {
        try {
            execSync(
                "grep -r \"HomelabSocket\" --exclude-dir=node_modules --exclude-dir=.git --include=\"*.ts\" -l .",
                { cwd: ROOT_DIR,
                    encoding: "utf-8",
                    timeout: 30000 }
            );
        } catch {
            expect.fail("HomelabSocket interface not found in codebase");
        }
    });

    it("should use HOMELAB_ prefix for environment variables", () => {
        try {
            execSync(
                "grep -r \"HOMELAB_\" --exclude-dir=node_modules --exclude-dir=.git --include=\"*.ts\" --include=\"*.go\" -l .",
                { cwd: ROOT_DIR,
                    encoding: "utf-8",
                    timeout: 30000 }
            );
        } catch {
            expect.fail("No HOMELAB_ environment variables found in codebase");
        }
    });

    it("should reference ghcr.io/tyevco/homelab in Docker config", () => {
        try {
            execSync(
                "grep -r \"ghcr.io/tyevco/homelab\" --exclude-dir=node_modules --exclude-dir=.git --include=\"*.json\" --include=\"*.yaml\" --include=\"*.yml\" -l .",
                { cwd: ROOT_DIR,
                    encoding: "utf-8",
                    timeout: 30000 }
            );
        } catch {
            expect.fail("No ghcr.io/tyevco/homelab references found");
        }
    });
});
