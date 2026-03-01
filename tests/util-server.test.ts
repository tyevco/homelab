import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidationError, callbackError, callbackResult, fileExists, checkLogin, doubleCheckPassword } from "../backend/util-server";
import type { HomelabSocket } from "../backend/util-server";
import { ERROR_TYPE_VALIDATION } from "../common/util-common";
import path from "path";

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        findOne: vi.fn(),
    }
}));

// Mock password-hash
vi.mock("../backend/password-hash", () => ({
    verifyPassword: vi.fn(),
}));

import { R } from "redbean-node";
import { verifyPassword } from "../backend/password-hash";

describe("util-server", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("checkLogin", () => {
        it("should throw when userID is falsy (0)", () => {
            const socket = { userID: 0 } as unknown as HomelabSocket;
            expect(() => checkLogin(socket)).toThrow("You are not logged in.");
        });

        it("should throw when userID is undefined", () => {
            const socket = {} as unknown as HomelabSocket;
            expect(() => checkLogin(socket)).toThrow("You are not logged in.");
        });

        it("should not throw when userID is set", () => {
            const socket = { userID: 42 } as unknown as HomelabSocket;
            expect(() => checkLogin(socket)).not.toThrow();
        });
    });

    describe("doubleCheckPassword", () => {
        it("should throw for non-string password", async () => {
            const socket = { userID: 1 } as unknown as HomelabSocket;
            await expect(doubleCheckPassword(socket, 123))
                .rejects.toThrow("Wrong data type?");
        });

        it("should throw for undefined password", async () => {
            const socket = { userID: 1 } as unknown as HomelabSocket;
            await expect(doubleCheckPassword(socket, undefined))
                .rejects.toThrow("Wrong data type?");
        });

        it("should throw when user is not found", async () => {
            const socket = { userID: 999 } as unknown as HomelabSocket;
            vi.mocked(R.findOne).mockResolvedValue(null as never);

            await expect(doubleCheckPassword(socket, "password"))
                .rejects.toThrow("Incorrect current password");
        });

        it("should throw when password does not match", async () => {
            const socket = { userID: 1 } as unknown as HomelabSocket;
            vi.mocked(R.findOne).mockResolvedValue({ password: "hashed" } as never);
            vi.mocked(verifyPassword).mockReturnValue(false);

            await expect(doubleCheckPassword(socket, "wrong"))
                .rejects.toThrow("Incorrect current password");
        });

        it("should return user when password matches", async () => {
            const socket = { userID: 1 } as unknown as HomelabSocket;
            const user = { id: 1,
                password: "hashed" };
            vi.mocked(R.findOne).mockResolvedValue(user as never);
            vi.mocked(verifyPassword).mockReturnValue(true);

            const result = await doubleCheckPassword(socket, "correct");
            expect(result).toBe(user);
        });
    });

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
