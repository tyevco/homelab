import { describe, it, expect, vi } from "vitest";

// Mock BeanModel to avoid ORM initialization
vi.mock("redbean-node/dist/bean-model", () => ({
    BeanModel: class BeanModel {
        [key: string]: unknown;
        constructor(_type?: string, _R?: unknown) { }
    },
}));

import { ApiToken } from "../backend/models/api_token";

describe("ApiToken", () => {

    describe("toJSON", () => {
        it("should return only safe fields", () => {
            const token = new (ApiToken as unknown as new () => ApiToken)();
            (token as unknown as Record<string, unknown>).id = 1;
            (token as unknown as Record<string, unknown>).name = "My Token";
            (token as unknown as Record<string, unknown>).token_prefix = "hlk_abcdef";
            (token as unknown as Record<string, unknown>).token_hash = "bcrypt_hash_should_be_hidden";
            (token as unknown as Record<string, unknown>).active = true;
            (token as unknown as Record<string, unknown>).created_at = "2026-03-02T00:00:00Z";
            (token as unknown as Record<string, unknown>).user_id = 42;

            const json = token.toJSON();

            expect(json.id).toBe(1);
            expect(json.name).toBe("My Token");
            expect(json.tokenPrefix).toBe("hlk_abcdef");
            expect(json.active).toBe(true);
            expect(json.createdAt).toBe("2026-03-02T00:00:00Z");
        });

        it("should never expose token_hash", () => {
            const token = new (ApiToken as unknown as new () => ApiToken)();
            (token as unknown as Record<string, unknown>).id = 1;
            (token as unknown as Record<string, unknown>).name = "test";
            (token as unknown as Record<string, unknown>).token_prefix = "hlk_123456";
            (token as unknown as Record<string, unknown>).token_hash = "super_secret_hash";
            (token as unknown as Record<string, unknown>).active = true;
            (token as unknown as Record<string, unknown>).created_at = "2026-03-02";

            const json = token.toJSON();
            const jsonStr = JSON.stringify(json);

            expect(jsonStr).not.toContain("super_secret_hash");
            expect(jsonStr).not.toContain("token_hash");
            expect(jsonStr).not.toContain("tokenHash");
        });

        it("should never expose user_id", () => {
            const token = new (ApiToken as unknown as new () => ApiToken)();
            (token as unknown as Record<string, unknown>).id = 1;
            (token as unknown as Record<string, unknown>).name = "test";
            (token as unknown as Record<string, unknown>).token_prefix = "hlk_123456";
            (token as unknown as Record<string, unknown>).token_hash = "hash";
            (token as unknown as Record<string, unknown>).active = true;
            (token as unknown as Record<string, unknown>).created_at = "2026-03-02";
            (token as unknown as Record<string, unknown>).user_id = 42;

            const json = token.toJSON();
            const jsonStr = JSON.stringify(json);

            expect(jsonStr).not.toContain("user_id");
            expect(jsonStr).not.toContain("userId");
        });

        it("should handle inactive tokens", () => {
            const token = new (ApiToken as unknown as new () => ApiToken)();
            (token as unknown as Record<string, unknown>).id = 2;
            (token as unknown as Record<string, unknown>).name = "Revoked";
            (token as unknown as Record<string, unknown>).token_prefix = "hlk_revoke";
            (token as unknown as Record<string, unknown>).active = false;
            (token as unknown as Record<string, unknown>).created_at = "2026-01-01";

            const json = token.toJSON();
            expect(json.active).toBe(false);
        });
    });
});
