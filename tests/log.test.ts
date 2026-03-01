import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, CONSOLE_STYLE_Reset, CONSOLE_STYLE_FgRed, CONSOLE_STYLE_FgCyan } from "../backend/log";

describe("Logger", () => {
    let infoSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let debugSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
        logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("info", () => {
        it("should call console.info with formatted output", () => {
            log.info("test", "hello world");
            expect(infoSpy).toHaveBeenCalledTimes(1);
            const args = infoSpy.mock.calls[0];
            // Should have time, module, level, and message parts
            expect(args).toHaveLength(4);
            expect(args[3]).toBe("hello world");
        });

        it("should uppercase the module name", () => {
            log.info("mymodule", "test");
            const args = infoSpy.mock.calls[0];
            // Module part should contain uppercase module name
            expect(args[1]).toContain("MYMODULE");
        });

        it("should include INFO level label", () => {
            log.info("test", "msg");
            const args = infoSpy.mock.calls[0];
            expect(args[2]).toContain("INFO:");
        });
    });

    describe("warn", () => {
        it("should call console.warn", () => {
            log.warn("test", "warning message");
            expect(warnSpy).toHaveBeenCalledTimes(1);
            const args = warnSpy.mock.calls[0];
            expect(args[3]).toBe("warning message");
        });

        it("should include WARN level label", () => {
            log.warn("test", "msg");
            const args = warnSpy.mock.calls[0];
            expect(args[2]).toContain("WARN:");
        });
    });

    describe("error", () => {
        it("should call console.error", () => {
            log.error("test", "error message");
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it("should wrap string messages in red color codes", () => {
            log.error("test", "red error");
            const args = errorSpy.mock.calls[0];
            expect(args[3]).toContain(CONSOLE_STYLE_FgRed);
            expect(args[3]).toContain("red error");
            expect(args[3]).toContain(CONSOLE_STYLE_Reset);
        });

        it("should pass non-string messages through unmodified", () => {
            const errObj = { code: 500 };
            log.error("test", errObj);
            const args = errorSpy.mock.calls[0];
            expect(args[3]).toBe(errObj);
        });
    });

    describe("exception", () => {
        it("should log exception as error", () => {
            log.exception("test", new Error("boom"), "Context message");
            expect(errorSpy).toHaveBeenCalledTimes(1);
        });

        it("should combine message and exception when msg is provided", () => {
            log.exception("test", "exception detail", "Something failed");
            const args = errorSpy.mock.calls[0];
            // The final message should combine msg and exception
            expect(args[3]).toContain("Something failed");
            expect(args[3]).toContain("exception detail");
        });

        it("should use exception alone when no msg provided", () => {
            log.exception("test", "raw exception", undefined);
            const args = errorSpy.mock.calls[0];
            // String errors get wrapped in red ANSI codes by the error handler
            expect(args[3]).toContain("raw exception");
        });
    });

    describe("log level routing", () => {
        it("should route unknown levels to console.log", () => {
            log.log("test", "custom level message", "CUSTOM");
            expect(logSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("console style constants", () => {
        it("should have correct ANSI escape codes", () => {
            expect(CONSOLE_STYLE_Reset).toBe("\x1b[0m");
            expect(CONSOLE_STYLE_FgRed).toBe("\x1b[31m");
            expect(CONSOLE_STYLE_FgCyan).toBe("\x1b[36m");
        });
    });
});
