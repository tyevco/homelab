import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationService } from "../backend/notification-service";

// Mock settings
vi.mock("../backend/settings", () => ({
    Settings: {
        getSettings: vi.fn(),
    },
}));

// Mock log
vi.mock("../backend/log", () => ({
    log: {
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
    },
}));

import { Settings } from "../backend/settings";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const okResponse = { ok: true,
    status: 200 } as Response;

beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue(okResponse);
});

describe("NotificationService.sendToNtfy", () => {
    it("POSTs to the ntfy URL", async () => {
        await NotificationService.sendToNtfy({ ntfyEnabled: true,
            ntfyUrl: "https://ntfy.sh/my-topic" }, "hello");
        expect(mockFetch).toHaveBeenCalledWith(
            "https://ntfy.sh/my-topic",
            expect.objectContaining({ method: "POST",
                body: "hello" })
        );
    });

    it("logs a warning on non-ok status", async () => {
        mockFetch.mockResolvedValue({ ok: false,
            status: 403 } as Response);
        const { log } = await import("../backend/log");
        await NotificationService.sendToNtfy({ ntfyEnabled: true,
            ntfyUrl: "https://ntfy.sh/topic" }, "msg");
        expect(log.warn).toHaveBeenCalled();
    });
});

describe("NotificationService.sendToDiscord", () => {
    it("POSTs JSON to the Discord webhook URL", async () => {
        await NotificationService.sendToDiscord({ discordEnabled: true,
            discordWebhookUrl: "https://discord.com/api/webhooks/123/abc" }, "alert");
        expect(mockFetch).toHaveBeenCalledWith(
            "https://discord.com/api/webhooks/123/abc",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ content: "alert" }),
            })
        );
    });
});

describe("NotificationService.sendToGotify", () => {
    it("POSTs to /message with auth token", async () => {
        await NotificationService.sendToGotify(
            { gotifyEnabled: true,
                gotifyUrl: "https://gotify.example.com",
                gotifyToken: "tok123" },
            "disk error"
        );
        expect(mockFetch).toHaveBeenCalledWith(
            "https://gotify.example.com/message",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({ "X-Gotify-Key": "tok123" }),
            })
        );
    });

    it("strips trailing slash from gotifyUrl", async () => {
        await NotificationService.sendToGotify(
            { gotifyEnabled: true,
                gotifyUrl: "https://gotify.example.com/",
                gotifyToken: "tok" },
            "msg"
        );
        const [ calledUrl ] = mockFetch.mock.calls[0];
        expect(calledUrl).toBe("https://gotify.example.com/message");
    });
});

describe("NotificationService.sendToWebhook", () => {
    it("POSTs JSON with event and message", async () => {
        await NotificationService.sendToWebhook({ webhookEnabled: true,
            webhookUrl: "https://example.com/hook" }, "test");
        expect(mockFetch).toHaveBeenCalledWith(
            "https://example.com/hook",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ event: "homelab_alert",
                    message: "test" }),
            })
        );
    });
});

describe("NotificationService.send", () => {
    it("dispatches to all enabled providers", async () => {
        vi.mocked(Settings.getSettings).mockResolvedValue({
            ntfyEnabled: true,
            ntfyUrl: "https://ntfy.sh/topic",
            discordEnabled: true,
            discordWebhookUrl: "https://discord.com/api/webhooks/1/x",
            gotifyEnabled: false,
            webhookEnabled: false,
        });

        await NotificationService.send("agent_offline", "Agent x disconnected");

        // Two providers enabled → two fetch calls
        expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("skips disabled providers", async () => {
        vi.mocked(Settings.getSettings).mockResolvedValue({
            ntfyEnabled: false,
            discordEnabled: false,
            gotifyEnabled: false,
            webhookEnabled: false,
        });

        await NotificationService.send("agent_online", "Agent y connected");
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it("handles settings load failure gracefully", async () => {
        vi.mocked(Settings.getSettings).mockRejectedValue(new Error("DB down"));
        await expect(NotificationService.send("agent_offline", "msg")).resolves.toBeUndefined();
    });
});
