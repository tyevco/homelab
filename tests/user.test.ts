import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { shake256, SHAKE256_LENGTH } from "../backend/password-hash";

// Mock BeanModel to avoid ORM initialization
vi.mock("redbean-node/dist/bean-model", () => ({
    BeanModel: class BeanModel {
        [key: string]: unknown;
    },
}));

// Mock redbean-node
vi.mock("redbean-node", () => ({
    R: {
        exec: vi.fn(),
    }
}));

// Mock password-hash (partial - keep shake256 real)
vi.mock("../backend/password-hash", async () => {
    const actual = await vi.importActual("../backend/password-hash");
    return {
        ...actual,
        generatePasswordHash: vi.fn((pw: string) => `hashed_${pw}`),
    };
});

import { User } from "../backend/models/user";
import { R } from "redbean-node";
import { generatePasswordHash } from "../backend/password-hash";

describe("User", () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("createJWT", () => {
        it("should return a valid JWT string", () => {
            const user = { username: "admin",
                password: "bcrypt_hash_here" } as unknown as User;
            const token = User.createJWT(user, "test-secret");
            expect(typeof token).toBe("string");
            expect(token.split(".")).toHaveLength(3);
        });

        it("should embed username and password hash in JWT payload", () => {
            const user = { username: "testuser",
                password: "some_hash" } as unknown as User;
            const token = User.createJWT(user, "secret123");
            const decoded = jwt.verify(token, "secret123") as Record<string, string>;
            expect(decoded.username).toBe("testuser");
            expect(decoded.h).toBe(shake256("some_hash", SHAKE256_LENGTH));
        });

        it("should produce different tokens for different passwords", () => {
            const user1 = { username: "admin",
                password: "hash1" } as unknown as User;
            const user2 = { username: "admin",
                password: "hash2" } as unknown as User;
            const token1 = User.createJWT(user1, "secret");
            const token2 = User.createJWT(user2, "secret");
            expect(token1).not.toBe(token2);
        });

        it("should fail verification with wrong secret", () => {
            const user = { username: "admin",
                password: "hash" } as unknown as User;
            const token = User.createJWT(user, "correct-secret");
            expect(() => jwt.verify(token, "wrong-secret")).toThrow();
        });
    });

    describe("static resetPassword", () => {
        it("should execute SQL update with hashed password", async () => {
            vi.mocked(R.exec).mockResolvedValue(undefined as never);

            const result = await User.resetPassword(42, "newPass123");

            expect(R.exec).toHaveBeenCalledWith(
                "UPDATE `user` SET password = ? WHERE id = ? ",
                [ "hashed_newPass123", 42 ]
            );
            expect(result).toBe("hashed_newPass123");
        });

        it("should return the hashed password", async () => {
            vi.mocked(R.exec).mockResolvedValue(undefined as never);

            const hash = await User.resetPassword(1, "secret");
            expect(hash).toBe("hashed_secret");
            expect(generatePasswordHash).toHaveBeenCalledWith("secret");
        });
    });

    describe("instance resetPassword", () => {
        it("should update instance password to the hash", async () => {
            vi.mocked(R.exec).mockResolvedValue(undefined as never);

            const user = new User();
            (user as unknown as Record<string, unknown>).id = 10;
            user.password = "old_hash";

            await user.resetPassword("brandNew");
            expect(user.password).toBe("hashed_brandNew");
        });
    });
});
