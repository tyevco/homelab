import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vue-toastification before importing
vi.mock("vue-toastification", () => ({
    POSITION: { BOTTOM_RIGHT: "bottom-right" },
}));

// Mock dayjs timezone plugin
vi.mock("dayjs", () => {
    const fn = () => ({
        tz: () => ({
            format: () => "+00:00",
        }),
    });
    fn.extend = vi.fn();
    return { default: fn };
});

vi.mock("timezones-list", () => ({
    default: [],
}));

vi.mock("../frontend/src/i18n", () => ({
    localeDirection: () => "ltr",
    currentLocale: () => "en",
}));

import {
    hostNameRegexPattern,
    getToastSuccessTimeout,
    getToastErrorTimeout,
    loadToastSettings,
} from "../frontend/src/util-frontend";

describe("util-frontend", () => {

    describe("hostNameRegexPattern", () => {
        it("should match valid IPv4 addresses", () => {
            const regex = new RegExp(hostNameRegexPattern());
            expect(regex.test("192.168.1.1")).toBe(true);
            expect(regex.test("10.0.0.1")).toBe(true);
            expect(regex.test("255.255.255.255")).toBe(true);
        });

        it("should reject strings with spaces", () => {
            const regex = new RegExp(hostNameRegexPattern());
            expect(regex.test("bad host name")).toBe(false);
            expect(regex.test(" ")).toBe(false);
        });

        it("should match valid hostnames", () => {
            const regex = new RegExp(hostNameRegexPattern());
            expect(regex.test("example.com")).toBe(true);
            expect(regex.test("my-host")).toBe(true);
            expect(regex.test("sub.domain.example.com")).toBe(true);
            expect(regex.test("localhost")).toBe(true);
        });

        it("should reject hostnames with spaces or special chars", () => {
            const regex = new RegExp(hostNameRegexPattern());
            expect(regex.test("bad host")).toBe(false);
            expect(regex.test("bad!host")).toBe(false);
        });

        it("should optionally accept mqtt schemes when mqtt=true", () => {
            const regex = new RegExp(hostNameRegexPattern(true));
            expect(regex.test("mqtt://example.com")).toBe(true);
            expect(regex.test("mqtts://example.com")).toBe(true);
            expect(regex.test("ws://example.com")).toBe(true);
            expect(regex.test("wss://example.com")).toBe(true);
        });

        it("should not accept mqtt schemes when mqtt=false", () => {
            const regex = new RegExp(hostNameRegexPattern(false));
            expect(regex.test("mqtt://example.com")).toBe(false);
        });
    });

    describe("getToastSuccessTimeout", () => {
        const originalLocalStorage = globalThis.localStorage;

        beforeEach(() => {
            const store: Record<string, string> = {};
            Object.defineProperty(globalThis, "localStorage", {
                value: store,
                writable: true,
                configurable: true,
            });
        });

        afterEach(() => {
            Object.defineProperty(globalThis, "localStorage", {
                value: originalLocalStorage,
                writable: true,
                configurable: true,
            });
        });

        it("should return default 20000 when no localStorage value", () => {
            expect(getToastSuccessTimeout()).toBe(20000);
        });

        it("should return custom value from localStorage", () => {
            (globalThis.localStorage as unknown as Record<string, string>).toastSuccessTimeout = "5000";
            expect(getToastSuccessTimeout()).toBe(5000);
        });

        it("should return false when value is -1", () => {
            (globalThis.localStorage as unknown as Record<string, string>).toastSuccessTimeout = "-1";
            expect(getToastSuccessTimeout()).toBe(false);
        });

        it("should ignore non-numeric localStorage value", () => {
            (globalThis.localStorage as unknown as Record<string, string>).toastSuccessTimeout = "abc";
            expect(getToastSuccessTimeout()).toBe(20000);
        });
    });

    describe("getToastErrorTimeout", () => {
        const originalLocalStorage = globalThis.localStorage;

        beforeEach(() => {
            const store: Record<string, string> = {};
            Object.defineProperty(globalThis, "localStorage", {
                value: store,
                writable: true,
                configurable: true,
            });
        });

        afterEach(() => {
            Object.defineProperty(globalThis, "localStorage", {
                value: originalLocalStorage,
                writable: true,
                configurable: true,
            });
        });

        it("should return false by default (errorTimeout starts at -1)", () => {
            expect(getToastErrorTimeout()).toBe(false);
        });

        it("should return custom value from localStorage", () => {
            (globalThis.localStorage as unknown as Record<string, string>).toastErrorTimeout = "10000";
            expect(getToastErrorTimeout()).toBe(10000);
        });

        it("should return false when localStorage value is -1", () => {
            (globalThis.localStorage as unknown as Record<string, string>).toastErrorTimeout = "-1";
            expect(getToastErrorTimeout()).toBe(false);
        });
    });

    describe("loadToastSettings", () => {
        it("should return object with position and containerClassName", () => {
            const settings = loadToastSettings();
            expect(settings.position).toBe("bottom-right");
            expect(settings.containerClassName).toBe("toast-container");
            expect(settings.showCloseButtonOnHover).toBe(true);
        });

        it("should filter toasts with timeout 0", () => {
            const settings = loadToastSettings();
            expect(settings.filterBeforeCreate({ timeout: 0 }, [])).toBe(false);
        });

        it("should pass through toasts with non-zero timeout", () => {
            const settings = loadToastSettings();
            const toast = {
                timeout: 5000,
                message: "test",
            };
            expect(settings.filterBeforeCreate(toast, [])).toBe(toast);
        });
    });
});
