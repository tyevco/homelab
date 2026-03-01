import { HomelabServer } from "../homelab-server";
import { Router } from "../router";
import express, { Express, NextFunction, Request, Response, Router as ExpressRouter } from "express";
import { LxcContainer } from "../lxc-container";
import { RUNNING, FROZEN } from "../../common/util-common";
import { R } from "redbean-node";
import jwt from "jsonwebtoken";
import { JWTDecoded } from "../util-server";
import childProcessAsync from "promisify-child-process";
import { log } from "../log";

const CONTAINER_NAME_REGEX = /^[a-z0-9_.-]+$/;

export class LxcApiRouter extends Router {
    create(app: Express, server: HomelabServer): ExpressRouter {
        const router = express.Router();

        // Auth middleware
        const auth = async (req: Request, res: Response, next: NextFunction) => {
            try {
                const authHeader = req.headers["authorization"];
                if (!authHeader || !authHeader.startsWith("Bearer ")) {
                    res.status(401).json({ ok: false,
                        msg: "Missing or invalid Authorization header" });
                    return;
                }

                const token = authHeader.slice(7);
                let decoded: JWTDecoded;

                try {
                    decoded = jwt.verify(token, server.jwtSecret) as JWTDecoded;
                } catch (e) {
                    res.status(401).json({ ok: false,
                        msg: "Invalid or expired token" });
                    return;
                }

                const user = await R.findOne("user", " username = ? AND active = 1 ", [ decoded.username ]);
                if (!user) {
                    res.status(401).json({ ok: false,
                        msg: "User not found or inactive" });
                    return;
                }

                next();
            } catch (e) {
                log.error("lxc-api", e);
                res.status(401).json({ ok: false,
                    msg: "Authentication failed" });
            }
        };

        // LXC availability check middleware
        const lxcCheck = async (_req: Request, res: Response, next: NextFunction) => {
            const available = await LxcContainer.isLxcAvailable();
            if (!available) {
                res.status(503).json({ ok: false,
                    msg: "LXC is not available on this system" });
                return;
            }
            next();
        };

        router.use("/api/lxc", auth, lxcCheck);

        // GET /api/lxc/ - List all containers
        router.get("/api/lxc/", async (_req: Request, res: Response) => {
            try {
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
        router.get("/api/lxc/distributions", async (_req: Request, res: Response) => {
            try {
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
            try {
                const { name } = req.params;
                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
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
            try {
                const { name } = req.params;

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
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
            try {
                const { name } = req.params;

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
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
            try {
                const { name } = req.params;

                if (!CONTAINER_NAME_REGEX.test(name)) {
                    res.status(400).json({ ok: false,
                        msg: "Invalid container name" });
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
