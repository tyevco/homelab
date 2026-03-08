import { HomelabServer } from "../homelab-server";
import { Router } from "../router";
import express, { Express, NextFunction, Request, Response, Router as ExpressRouter } from "express";
import { LxcContainer } from "../lxc-container";
import { RUNNING, FROZEN } from "../../common/util-common";
import { createApiAuthMiddleware } from "../util-server";
import childProcessAsync from "promisify-child-process";
import { log } from "../log";
import { apiRateLimiter, rateLimitMiddleware } from "../rate-limiter";
import { Settings } from "../settings";

const CONTAINER_NAME_REGEX = /^[a-z0-9_.-]+$/;

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

export class LxcApiRouter extends Router {
    create(app: Express, server: HomelabServer): ExpressRouter {
        const router = express.Router();

        const auth = createApiAuthMiddleware(server.jwtSecret);

        // LXC availability check middleware
        const lxcCheck = async (req: Request, res: Response, next: NextFunction) => {
            const localOk = await LxcContainer.isLxcAvailable();
            const requested = (req.query.endpoint as string) || "";
            const defaultEndpoint = requested ? "" : ((await Settings.get("defaultLxcEndpoint")) || "");
            const endpoint = requested || defaultEndpoint;

            res.locals.lxcEndpoint = endpoint;

            if (!localOk && endpoint) {
                const caps = server.serverAgentManager?.agentCapabilities[endpoint];
                if (!caps?.lxcAvailable) {
                    res.status(503).json({ ok: false,
                        msg: "LXC is not available on this endpoint" });
                    return;
                }
            } else if (!localOk) {
                const anyAgent = server.serverAgentManager
                    ? Object.values(server.serverAgentManager.agentCapabilities).some(c => c.lxcAvailable)
                    : false;
                if (!anyAgent) {
                    res.status(503).json({ ok: false,
                        msg: "LXC is not available on this system" });
                    return;
                }
            }
            next();
        };

        router.use("/api/lxc", rateLimitMiddleware(apiRateLimiter), auth, lxcCheck);

        // GET /api/lxc/ - List all containers
        router.get("/api/lxc/", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                if (endpoint) {
                    const cached = server.serverAgentManager?.containerListCache[endpoint];
                    const containers = cached ? Object.values(cached) : [];
                    res.json({ ok: true,
                        containers });
                    return;
                }
                const containerList = await LxcContainer.getContainerList(server);
                const containers: object[] = [];
                for (const [ , container ] of containerList) {
                    containers.push(container.toJSON(""));
                }
                res.json({ ok: true,
                    containers });
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // GET /api/lxc/distributions - List available OS distributions (must be before /:name)
        router.get("/api/lxc/distributions", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                if (endpoint) {
                    const result = await callAgent<{ distributions: string[] }>(server, endpoint, "getLxcDistributions");
                    res.json({ ok: true,
                        distributions: result.distributions });
                    return;
                }
                const distributions = await LxcContainer.getAvailableDistributions();
                res.json({ ok: true,
                    distributions });
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // GET /api/lxc/:name - Get single container
        router.get("/api/lxc/:name", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                const { name } = req.params;
                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
                    return;
                }
                if (endpoint) {
                    try {
                        const result = await callAgent<{ container: object }>(server, endpoint, "getLxcContainer", name);
                        res.json({ ok: true,
                            container: result.container });
                    } catch (e) {
                        res.status(404).json({ ok: false,
                            msg: e instanceof Error ? e.message : "Container not found" });
                    }
                    return;
                }
                try {
                    const container = await LxcContainer.getContainer(server, name);
                    res.json({ ok: true,
                        container: container.toJSON("") });
                } catch (e) {
                    res.status(404).json({ ok: false,
                        msg: "Container not found" });
                }
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // POST /api/lxc/ - Create container
        router.post("/api/lxc/", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                const { name, dist, release, arch } = req.body as { name?: string; dist?: string; release?: string; arch?: string };

                if (!name || !dist || !release || !arch) {
                    res.status(400).json({ ok: false,
                        msg: "Missing required fields: name, dist, release, arch" });
                    return;
                }

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Container name can only contain [a-z][0-9] _ . - characters" });
                    return;
                }
                if (!/^[a-zA-Z0-9_.-]+$/.test(dist)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid distribution name" });
                    return;
                }
                if (!/^[a-zA-Z0-9_.-]+$/.test(release)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid release name" });
                    return;
                }
                if (!/^[a-zA-Z0-9_]+$/.test(arch)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid architecture" });
                    return;
                }

                if (endpoint) {
                    await callAgent(server, endpoint, "createLxcContainer", name, dist, release, arch);
                    res.status(201).json({ ok: true,
                        msg: "Container created" });
                    return;
                }

                await childProcessAsync.spawn(
                    "lxc-create",
                    [ "-n", name, "-t", "download", "--", "--dist", dist, "--release", release, "--arch", arch ],
                    { encoding: "utf-8" }
                );

                await server.sendLxcContainerList();
                res.status(201).json({ ok: true,
                    msg: "Container created" });
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Failed to create container" });
            }
        });

        // PUT /api/lxc/:name/config - Save config
        router.put("/api/lxc/:name/config", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                const { name } = req.params;
                const { config } = req.body as { config?: string };

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
                    return;
                }
                if (typeof config !== "string") {
                    res.status(400).json({ ok: false,
                        msg: "Missing required field: config" });
                    return;
                }

                if (endpoint) {
                    try {
                        await callAgent(server, endpoint, "saveLxcConfig", name, config);
                        res.json({ ok: true,
                            msg: "Config saved" });
                    } catch (e) {
                        res.status(404).json({ ok: false,
                            msg: e instanceof Error ? e.message : "Container not found" });
                    }
                    return;
                }

                try {
                    const container = await LxcContainer.getContainer(server, name);
                    await container.saveConfig(config);
                    res.json({ ok: true,
                        msg: "Config saved" });
                } catch (e) {
                    res.status(404).json({ ok: false,
                        msg: "Container not found" });
                }
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // POST /api/lxc/:name/start - Start container
        router.post("/api/lxc/:name/start", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                const { name } = req.params;

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
                    return;
                }

                if (endpoint) {
                    try {
                        await callAgent(server, endpoint, "startLxcContainer", name);
                        res.json({ ok: true,
                            msg: "Container started" });
                    } catch (e) {
                        res.status(500).json({ ok: false,
                            msg: e instanceof Error ? e.message : "Failed to start container" });
                    }
                    return;
                }

                try {
                    await LxcContainer.getContainer(server, name);
                } catch (e) {
                    res.status(404).json({ ok: false,
                        msg: "Container not found" });
                    return;
                }

                await childProcessAsync.spawn("lxc-start", [ "-n", name ], { encoding: "utf-8" });
                await server.sendLxcContainerList();
                res.json({ ok: true,
                    msg: "Container started" });
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Failed to start container" });
            }
        });

        // POST /api/lxc/:name/stop - Stop container
        router.post("/api/lxc/:name/stop", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                const { name } = req.params;

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
                    return;
                }

                if (endpoint) {
                    try {
                        await callAgent(server, endpoint, "stopLxcContainer", name);
                        res.json({ ok: true,
                            msg: "Container stopped" });
                    } catch (e) {
                        res.status(500).json({ ok: false,
                            msg: e instanceof Error ? e.message : "Failed to stop container" });
                    }
                    return;
                }

                try {
                    await LxcContainer.getContainer(server, name);
                } catch (e) {
                    res.status(404).json({ ok: false,
                        msg: "Container not found" });
                    return;
                }

                await childProcessAsync.spawn("lxc-stop", [ "-n", name ], { encoding: "utf-8" });
                await server.sendLxcContainerList();
                res.json({ ok: true,
                    msg: "Container stopped" });
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Failed to stop container" });
            }
        });

        // DELETE /api/lxc/:name - Delete container
        router.delete("/api/lxc/:name", async (req: Request, res: Response) => {
            const endpoint = (res.locals.lxcEndpoint as string) || "";
            try {
                const { name } = req.params;

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
                    return;
                }

                if (endpoint) {
                    try {
                        await callAgent(server, endpoint, "deleteLxcContainer", name);
                        res.json({ ok: true,
                            msg: "Container deleted" });
                    } catch (e) {
                        res.status(500).json({ ok: false,
                            msg: e instanceof Error ? e.message : "Failed to delete container" });
                    }
                    return;
                }

                try {
                    await LxcContainer.getContainer(server, name);
                } catch (e) {
                    res.status(404).json({ ok: false,
                        msg: "Container not found" });
                    return;
                }

                // Stop first if running or frozen
                const statusList = await LxcContainer.getStatusList();
                const currentStatus = statusList.get(name);
                if (currentStatus === RUNNING || currentStatus === FROZEN) {
                    await childProcessAsync.spawn("lxc-stop", [ "-n", name ], { encoding: "utf-8" });
                }

                await childProcessAsync.spawn("lxc-destroy", [ "-n", name ], { encoding: "utf-8" });
                await server.sendLxcContainerList();
                res.json({ ok: true,
                    msg: "Container deleted" });
            } catch (e) {
                log.error("lxc-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Failed to delete container" });
            }
        });

        return router;
    }
}
