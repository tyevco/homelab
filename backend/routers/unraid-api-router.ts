import { HomelabServer } from "../homelab-server";
import { Router } from "../router";
import express, { Express, Request, Response, Router as ExpressRouter } from "express";
import { createApiAuthMiddleware } from "../util-server";
import { log } from "../log";
import { apiRateLimiter, rateLimitMiddleware } from "../rate-limiter";

export interface UnraidVmInfo {
    name: string;
    state: "started" | "stopped" | "unknown";
}

function callAgent<T>(server: HomelabServer, endpoint: string, event: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
        server.serverAgentManager!.emitToEndpoint(endpoint, event, ...args, (res: { ok: boolean; msg?: string } & T) => {
            if (res.ok) {
                resolve(res as T);
            } else {
                reject(new Error(res.msg || "Agent error"));
            }
        }).catch(reject);
    });
}

export class UnraidApiRouter extends Router {
    create(app: Express, server: HomelabServer): ExpressRouter {
        const router = express.Router();

        const auth = createApiAuthMiddleware(server.jwtSecret);

        router.use("/api/unraid", rateLimitMiddleware(apiRateLimiter), auth);

        // GET /api/unraid/vms - List all VMs
        router.get("/api/unraid/vms", async (req: Request, res: Response) => {
            const endpoint = (req.query.endpoint as string) || "";
            try {
                if (!endpoint) {
                    res.status(400).json({ ok: false,
                        msg: "endpoint query parameter is required for Unraid VM management" });
                    return;
                }

                const result = await callAgent<{ vms: UnraidVmInfo[] }>(server, endpoint, "getUnraidVms");
                res.json({ ok: true,
                    vms: result.vms || [] });
            } catch (e) {
                log.error("unraid-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // POST /api/unraid/vms/:name/start - Start a VM
        router.post("/api/unraid/vms/:name/start", async (req: Request, res: Response) => {
            const endpoint = (req.query.endpoint as string) || "";
            try {
                const { name } = req.params;

                if (!endpoint) {
                    res.status(400).json({ ok: false,
                        msg: "endpoint query parameter is required for Unraid VM management" });
                    return;
                }

                await callAgent(server, endpoint, "startUnraidVm", name);
                res.json({ ok: true,
                    msg: "Started" });
            } catch (e) {
                log.error("unraid-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Failed to start VM" });
            }
        });

        // POST /api/unraid/vms/:name/stop - Stop a VM
        router.post("/api/unraid/vms/:name/stop", async (req: Request, res: Response) => {
            const endpoint = (req.query.endpoint as string) || "";
            try {
                const { name } = req.params;

                if (!endpoint) {
                    res.status(400).json({ ok: false,
                        msg: "endpoint query parameter is required for Unraid VM management" });
                    return;
                }

                await callAgent(server, endpoint, "stopUnraidVm", name);
                res.json({ ok: true,
                    msg: "Stopped" });
            } catch (e) {
                log.error("unraid-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Failed to stop VM" });
            }
        });

        return router;
    }
}
