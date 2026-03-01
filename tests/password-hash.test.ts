import { describe, it, expect } from "vitest";
import {
    generatePasswordHash,
    verifyPassword,
    needRehashPassword,
    shake256,
    SHAKE256_LENGTH,
    encryptPassword,
    decryptPassword,
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

        it("should produce correct length for various output sizes", () => {
            // 4 bytes → 8 hex chars
            expect(shake256("data", 4)).toHaveLength(8);
            // 64 bytes → 128 hex chars
            expect(shake256("data", 64)).toHaveLength(128);
        });

        it("should produce different hashes for different output lengths", () => {
            const short = shake256("hello", 16);
            const long = shake256("hello", 32);
            expect(short).not.toBe(long);
            // With SHAKE256, shorter IS a prefix of longer - that's by design
            expect(long.startsWith(short)).toBe(true);
        });

        it("should return empty string for null-like falsy input", () => {
            expect(shake256(undefined as unknown as string, 16)).toBe("");
            expect(shake256(null as unknown as string, 16)).toBe("");
        });
    });

    describe("verifyPassword edge cases", () => {
        it("should return false for empty hash", () => {
            expect(verifyPassword("password", "")).toBe(false);
        });

        it("should return false for malformed hash", () => {
            expect(verifyPassword("password", "not-a-bcrypt-hash")).toBe(false);
        });
    });

    describe("generatePasswordHash edge cases", () => {
        it("should hash empty string and verify it", () => {
            const hash = generatePasswordHash("");
            expect(hash).toBeDefined();
            expect(verifyPassword("", hash)).toBe(true);
            expect(verifyPassword("notempty", hash)).toBe(false);
        });
    });

    describe("SHAKE256_LENGTH constant", () => {
        it("should be 16", () => {
            expect(SHAKE256_LENGTH).toBe(16);
        });
    });

    describe("encryptPassword + decryptPassword", () => {
        it("should round-trip encrypt and decrypt", () => {
            const key = "my-secret-jwt-key";
            const password = "agent-password-123";
            const encrypted = encryptPassword(password, key);
            const decrypted = decryptPassword(encrypted, key);
            expect(decrypted).toBe(password);
        });

        it("should produce different ciphertexts for same input (random IV)", () => {
            const key = "test-key";
            const password = "same-password";
            const enc1 = encryptPassword(password, key);
            const enc2 = encryptPassword(password, key);
            expect(enc1).not.toBe(enc2);
            // Both should decrypt to the same value
            expect(decryptPassword(enc1, key)).toBe(password);
            expect(decryptPassword(enc2, key)).toBe(password);
        });

        it("should throw with wrong key", () => {
            const encrypted = encryptPassword("secret", "correct-key");
            expect(() => decryptPassword(encrypted, "wrong-key")).toThrow();
        });

        it("should throw with invalid format (missing parts)", () => {
            expect(() => decryptPassword("not-valid-format", "key")).toThrow("Invalid encrypted password format");
        });

        it("should throw with invalid format (too many parts)", () => {
            expect(() => decryptPassword("a:b:c:d", "key")).toThrow("Invalid encrypted password format");
        });

        it("should handle empty password", () => {
            const key = "test-key";
            const encrypted = encryptPassword("", key);
            const decrypted = decryptPassword(encrypted, key);
            expect(decrypted).toBe("");
        });

        it("should handle unicode passwords", () => {
            const key = "test-key";
            const password = "p\u00e4ssw\u00f6rd\ud83d\udd12";
            const encrypted = encryptPassword(password, key);
            const decrypted = decryptPassword(encrypted, key);
            expect(decrypted).toBe(password);
        });

        it("should produce format iv:authTag:ciphertext in hex", () => {
            const encrypted = encryptPassword("test", "key");
            const parts = encrypted.split(":");
            expect(parts).toHaveLength(3);
            // All parts should be hex
            for (const part of parts) {
                expect(part).toMatch(/^[0-9a-f]+$/);
            }
        });
    });
});
