import { describe, it, expect, vi } from "vitest";
import { ValidationError, callbackError, callbackResult, fileExists } from "../backend/util-server";
import { ERROR_TYPE_VALIDATION } from "../common/util-common";
import path from "path";

describe("util-server", () => {

    describe("ValidationError", () => {
        it("should create an error with the given message", () => {
            const error = new ValidationError("Invalid input");
            expect(error.message).toBe("Invalid input");
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(ValidationError);
        });

        it("should have a name of Error", () => {
            const error = new ValidationError("test");
            expect(error.name).toBe("Error");
        });

        it("should have a stack trace", () => {
            const error = new ValidationError("test");
            expect(error.stack).toBeDefined();
        });

        it("should work with empty message", () => {
            const error = new ValidationError("");
            expect(error.message).toBe("");
        });
    });

    describe("callbackError", () => {
        it("should call callback with error message for Error instances", () => {
            const callback = vi.fn();
            const error = new Error("Something went wrong");
            callbackError(error, callback);

            expect(callback).toHaveBeenCalledWith({
                ok: false,
                msg: "Something went wrong",
                msgi18n: true,
            });
        });

        it("should call callback with validation type for ValidationError instances", () => {
            const callback = vi.fn();
            const error = new ValidationError("Field is required");
            callbackError(error, callback);

            expect(callback).toHaveBeenCalledWith({
                ok: false,
                type: ERROR_TYPE_VALIDATION,
                msg: "Field is required",
                msgi18n: true,
            });
        });

        it("should not throw if callback is not a function", () => {
            expect(() => callbackError(new Error("test"), null)).not.toThrow();
            expect(() => callbackError(new Error("test"), "not a function")).not.toThrow();
        });

        it("should not throw for undefined callback", () => {
            expect(() => callbackError(new Error("test"), undefined)).not.toThrow();
        });

        it("should not throw for numeric callback", () => {
            expect(() => callbackError(new Error("test"), 42)).not.toThrow();
        });

        it("should handle non-Error non-ValidationError values silently", () => {
            const callback = vi.fn();
            callbackError("string error", callback);
            expect(callback).not.toHaveBeenCalled();
        });

        it("should handle null error silently", () => {
            const callback = vi.fn();
            callbackError(null, callback);
            expect(callback).not.toHaveBeenCalled();
        });

        it("should handle undefined error silently", () => {
            const callback = vi.fn();
            callbackError(undefined, callback);
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe("callbackResult", () => {
        it("should call callback with the result", () => {
            const callback = vi.fn();
            const result = { ok: true,
                data: "test" };
            callbackResult(result, callback);
            expect(callback).toHaveBeenCalledWith(result);
        });

        it("should not throw if callback is not a function", () => {
            expect(() => callbackResult({ ok: true }, null)).not.toThrow();
        });

        it("should pass through any result type", () => {
            const callback = vi.fn();

            callbackResult("string result", callback);
            expect(callback).toHaveBeenLastCalledWith("string result");

            callbackResult(42, callback);
            expect(callback).toHaveBeenLastCalledWith(42);

            callbackResult(null, callback);
            expect(callback).toHaveBeenLastCalledWith(null);

            callbackResult(undefined, callback);
            expect(callback).toHaveBeenLastCalledWith(undefined);
        });

        it("should not throw for undefined callback", () => {
            expect(() => callbackResult({ ok: true }, undefined)).not.toThrow();
        });
    });

    describe("fileExists", () => {
        it("should return true for a file that exists", async () => {
            // package.json always exists at the project root
            const result = await fileExists(path.resolve("package.json"));
            expect(result).toBe(true);
        });

        it("should return false for a file that does not exist", async () => {
            const result = await fileExists("/nonexistent/path/file.txt");
            expect(result).toBe(false);
        });

        it("should return false for empty string path", async () => {
            const result = await fileExists("");
            expect(result).toBe(false);
        });
    });
});
