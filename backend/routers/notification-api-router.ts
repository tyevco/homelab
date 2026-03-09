import { HomelabServer } from "../homelab-server";
import { Router } from "../router";
import express, { Express, Request, Response, Router as ExpressRouter } from "express";
import { createApiAuthMiddleware } from "../util-server";
import { log } from "../log";
import { apiRateLimiter, rateLimitMiddleware } from "../rate-limiter";
import { Settings } from "../settings";

export interface NotificationSettings {
    ntfyEnabled?: boolean;
    ntfyUrl?: string;
    discordEnabled?: boolean;
    discordWebhookUrl?: string;
    gotifyEnabled?: boolean;
    gotifyUrl?: string;
    gotifyToken?: string;
    webhookEnabled?: boolean;
    webhookUrl?: string;
}

export class NotificationApiRouter extends Router {
    create(app: Express, server: HomelabServer): ExpressRouter {
        const router = express.Router();

        const auth = createApiAuthMiddleware(server.jwtSecret);

        router.use("/api/notifications", rateLimitMiddleware(apiRateLimiter), auth);

        // GET /api/notifications - Get notification settings
        router.get("/api/notifications", async (_req: Request, res: Response) => {
            try {
                const data = await Settings.getSettings("notifications");
                res.json({ ok: true,
                    data: data || {} });
            } catch (e) {
                log.error("notification-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // PUT /api/notifications - Save notification settings
        router.put("/api/notifications", async (req: Request, res: Response) => {
            try {
                const settings: NotificationSettings = req.body as NotificationSettings;
                await Settings.setSettings("notifications", settings);
                res.json({ ok: true,
                    data: settings });
            } catch (e) {
                log.error("notification-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        return router;
    }
}
