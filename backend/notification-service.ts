import { Settings } from "./settings";
import { log } from "./log";

export type NotificationEvent = "agent_offline" | "agent_online" | "container_crash";

interface NtfySettings {
    ntfyEnabled?: boolean;
    ntfyUrl?: string;
}

interface DiscordSettings {
    discordEnabled?: boolean;
    discordWebhookUrl?: string;
}

interface GotifySettings {
    gotifyEnabled?: boolean;
    gotifyUrl?: string;
    gotifyToken?: string;
}

interface WebhookSettings {
    webhookEnabled?: boolean;
    webhookUrl?: string;
}

type NotificationSettings = NtfySettings & DiscordSettings & GotifySettings & WebhookSettings;

export class NotificationService {

    static async send(event: NotificationEvent, message: string): Promise<void> {
        let settings: NotificationSettings;
        try {
            settings = await Settings.getSettings("notifications") as NotificationSettings;
        } catch (e) {
            log.error("notification", "Failed to load notification settings: " + e);
            return;
        }

        const promises: Promise<void>[] = [];

        if (settings.ntfyEnabled && settings.ntfyUrl) {
            promises.push(NotificationService.sendToNtfy(settings as Required<NtfySettings>, message));
        }

        if (settings.discordEnabled && settings.discordWebhookUrl) {
            promises.push(NotificationService.sendToDiscord(settings as Required<DiscordSettings>, message));
        }

        if (settings.gotifyEnabled && settings.gotifyUrl && settings.gotifyToken) {
            promises.push(NotificationService.sendToGotify(settings as Required<GotifySettings>, message));
        }

        if (settings.webhookEnabled && settings.webhookUrl) {
            promises.push(NotificationService.sendToWebhook(settings as Required<WebhookSettings>, message));
        }

        await Promise.allSettled(promises);
    }

    static async sendToNtfy(settings: Required<NtfySettings>, message: string): Promise<void> {
        try {
            const res = await fetch(settings.ntfyUrl, {
                method: "POST",
                body: message,
                headers: {
                    "Title": "Homelab Alert",
                },
            });
            if (!res.ok) {
                log.warn("notification", `ntfy returned status ${res.status}`);
            }
        } catch (e) {
            log.error("notification", "Failed to send ntfy notification: " + e);
        }
    }

    static async sendToDiscord(settings: Required<DiscordSettings>, message: string): Promise<void> {
        try {
            const res = await fetch(settings.discordWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: message }),
            });
            if (!res.ok) {
                log.warn("notification", `Discord webhook returned status ${res.status}`);
            }
        } catch (e) {
            log.error("notification", "Failed to send Discord notification: " + e);
        }
    }

    static async sendToGotify(settings: Required<GotifySettings>, message: string): Promise<void> {
        try {
            const url = settings.gotifyUrl.replace(/\/$/, "") + "/message";
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Gotify-Key": settings.gotifyToken,
                },
                body: JSON.stringify({ title: "Homelab Alert",
                    message }),
            });
            if (!res.ok) {
                log.warn("notification", `Gotify returned status ${res.status}`);
            }
        } catch (e) {
            log.error("notification", "Failed to send Gotify notification: " + e);
        }
    }

    static async sendToWebhook(settings: Required<WebhookSettings>, message: string): Promise<void> {
        try {
            const res = await fetch(settings.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ event: "homelab_alert",
                    message }),
            });
            if (!res.ok) {
                log.warn("notification", `Webhook returned status ${res.status}`);
            }
        } catch (e) {
            log.error("notification", "Failed to send webhook notification: " + e);
        }
    }
}
