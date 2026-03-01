import { describe, it, expect } from "vitest";
import {
    generatePasswordHash,
    verifyPassword,
    needRehashPassword,
    shake256,
    SHAKE256_LENGTH,
} from "../backend/password-hash";

describe("password-hash", () => {

    describe("generatePasswordHash + verifyPassword", () => {
        it("should hash a password and verify it correctly", () => {
            const password = "mySecurePassword123";
            const hash = generatePasswordHash(password);

            expect(hash).toBeDefined();
            expect(hash).not.toBe(password);
            expect(verifyPassword(password, hash)).toBe(true);
        });

        it("should fail verification with wrong password", () => {
            const hash = generatePasswordHash("correctPassword");
            expect(verifyPassword("wrongPassword", hash)).toBe(false);
        });

        it("should generate different hashes for the same password (salted)", () => {
            const password = "testPassword";
            const hash1 = generatePasswordHash(password);
            const hash2 = generatePasswordHash(password);
            expect(hash1).not.toBe(hash2);

            // Both should still verify
            expect(verifyPassword(password, hash1)).toBe(true);
            expect(verifyPassword(password, hash2)).toBe(true);
        });
    });

    describe("needRehashPassword", () => {
        it("should return false (current implementation)", () => {
            const hash = generatePasswordHash("test");
            expect(needRehashPassword(hash)).toBe(false);
        });
    });

    describe("shake256", () => {
        it("should return empty string for empty input", () => {
            expect(shake256("", 16)).toBe("");
        });

        it("should hash data to the expected length", () => {
            const result = shake256("test data", SHAKE256_LENGTH);
            // hex output: 2 chars per byte
            expect(result).toHaveLength(SHAKE256_LENGTH * 2);
        });

        it("should return consistent results", () => {
            const a = shake256("hello", 16);
            const b = shake256("hello", 16);
            expect(a).toBe(b);
        });

        it("should return different results for different inputs", () => {
            const a = shake256("hello", 16);
            const b = shake256("world", 16);
            expect(a).not.toBe(b);
        });

        it("should return hex string", () => {
            const result = shake256("test", 16);
            expect(result).toMatch(/^[0-9a-f]+$/);
        });
    });

    describe("SHAKE256_LENGTH constant", () => {
        it("should be 16", () => {
            expect(SHAKE256_LENGTH).toBe(16);
        });
    });
});
