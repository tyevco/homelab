import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        dedupe: [ "socket.io" ],
    },
    test: {
        include: [ "tests/**/*.test.ts" ],
    },
});
