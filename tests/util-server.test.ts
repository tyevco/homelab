import { describe, it, expect, vi } from "vitest";
import { ValidationError, callbackError, callbackResult } from "../backend/util-server";

describe("util-server", () => {

    describe("ValidationError", () => {
        it("should create an error with the given message", () => {
            const error = new ValidationError("Invalid input");
            expect(error.message).toBe("Invalid input");
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(ValidationError);
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

        it("should not throw if callback is not a function", () => {
            expect(() => callbackError(new Error("test"), null)).not.toThrow();
            expect(() => callbackError(new Error("test"), "not a function")).not.toThrow();
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
    });
});
