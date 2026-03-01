import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import compareVersions from "compare-versions";

// Mock Settings before importing check-version
vi.mock("../backend/settings", () => ({
    Settings: {
        get: vi.fn(),
    }
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import checkVersion from "../backend/check-version";
import { Settings } from "../backend/settings";

describe("check-version", () => {

    beforeEach(() => {
        vi.clearAllMocks();
        checkVersion.latestVersion = undefined;
        if (checkVersion.interval) {
            clearInterval(checkVersion.interval);
            checkVersion.interval = undefined;
        }
    });

    afterEach(() => {
        if (checkVersion.interval) {
            clearInterval(checkVersion.interval);
            checkVersion.interval = undefined;
        }
    });

    describe("version property", () => {
        it("should have a version from package.json", () => {
            expect(checkVersion.version).toBeDefined();
            expect(typeof checkVersion.version).toBe("string");
            expect(checkVersion.version).toMatch(/^\d+\.\d+\.\d+/);
        });
    });

    describe("startInterval", () => {
        it("should skip check when checkUpdate setting is false", async () => {
            vi.mocked(Settings.get).mockResolvedValue(false);
            await checkVersion.startInterval();
            expect(mockFetch).not.toHaveBeenCalled();
            expect(checkVersion.latestVersion).toBeUndefined();
        });

        it("should set latestVersion from slow channel", async () => {
            vi.mocked(Settings.get).mockImplementation(async (key: string) => {
                if (key === "checkUpdate") {
                    return true;
                }
                if (key === "checkBeta") {
                    return false;
                }
                return null;
            });
            mockFetch.mockResolvedValue({
                json: () => Promise.resolve({ slow: "2.0.0" }),
            });

            await checkVersion.startInterval();
            expect(checkVersion.latestVersion).toBe("2.0.0");
        });

        it("should prefer beta over slow when beta is higher and checkBeta enabled", async () => {
            vi.mocked(Settings.get).mockImplementation(async (key: string) => {
                if (key === "checkUpdate") {
                    return true;
                }
                if (key === "checkBeta") {
                    return true;
                }
                return null;
            });
            mockFetch.mockResolvedValue({
                json: () => Promise.resolve({ slow: "1.5.0",
                    beta: "2.0.0-beta.1" }),
            });

            await checkVersion.startInterval();
            expect(checkVersion.latestVersion).toBe("2.0.0-beta.1");
        });

        it("should use slow when beta is lower than slow", async () => {
            vi.mocked(Settings.get).mockImplementation(async (key: string) => {
                if (key === "checkUpdate") {
                    return true;
                }
                if (key === "checkBeta") {
                    return true;
                }
                return null;
            });
            mockFetch.mockResolvedValue({
                json: () => Promise.resolve({ slow: "2.0.0",
                    beta: "1.9.0-beta.1" }),
            });

            await checkVersion.startInterval();
            expect(checkVersion.latestVersion).toBe("2.0.0");
        });

        it("should handle fetch errors gracefully", async () => {
            vi.mocked(Settings.get).mockResolvedValue(true);
            mockFetch.mockRejectedValue(new Error("Network error"));

            await checkVersion.startInterval();
            expect(checkVersion.latestVersion).toBeUndefined();
        });

        it("should handle JSON parse errors gracefully", async () => {
            vi.mocked(Settings.get).mockResolvedValue(true);
            mockFetch.mockResolvedValue({
                json: () => Promise.reject(new Error("Invalid JSON")),
            });

            await checkVersion.startInterval();
            expect(checkVersion.latestVersion).toBeUndefined();
        });

        it("should not set latestVersion when response has no slow field", async () => {
            vi.mocked(Settings.get).mockImplementation(async (key: string) => {
                if (key === "checkUpdate") {
                    return true;
                }
                if (key === "checkBeta") {
                    return false;
                }
                return null;
            });
            mockFetch.mockResolvedValue({
                json: () => Promise.resolve({}),
            });

            await checkVersion.startInterval();
            expect(checkVersion.latestVersion).toBeUndefined();
        });

        it("should set up an interval", async () => {
            vi.mocked(Settings.get).mockResolvedValue(false);
            await checkVersion.startInterval();
            expect(checkVersion.interval).toBeDefined();
        });
    });

    describe("compare-versions integration", () => {
        it("should correctly compare semver versions", () => {
            expect(compareVersions.compare("2.0.0", "1.5.0", ">")).toBe(true);
            expect(compareVersions.compare("1.0.0", "2.0.0", ">")).toBe(false);
            expect(compareVersions.compare("1.5.0-beta.1", "1.5.0", ">")).toBe(false);
            expect(compareVersions.compare("2.0.0-beta.1", "1.5.0", ">")).toBe(true);
        });
    });
});
