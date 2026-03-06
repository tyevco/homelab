import { HomelabServer } from "../homelab-server";
import { Router } from "../router";
import express, { Express, Request, Response, Router as ExpressRouter } from "express";
import { createApiAuthMiddleware } from "../util-server";
import { apiRateLimiter, rateLimitMiddleware } from "../rate-limiter";
import { log } from "../log";
import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

export const ROUTE_NAME_REGEX = /^[a-z0-9_-]+$/;

export interface TraefikRouteInfo {
    name: string;
    content: string;
    lastModified: string;
}

export function validateYaml(content: string): { valid: boolean; error?: string } {
    try {
        parseYaml(content);
        return { valid: true };
    } catch (e) {
        return { valid: false,
            error: e instanceof Error ? e.message : String(e) };
    }
}

export function writeRouteFile(configsDir: string, name: string, content: string): TraefikRouteInfo {
    fs.mkdirSync(configsDir, { recursive: true });
    const filePath = path.join(configsDir, `${name}.yml`);
    fs.writeFileSync(filePath, content, "utf-8");
    const stat = fs.statSync(filePath);
    return { name,
        content,
        lastModified: stat.mtime.toISOString() };
}

export class TraefikApiRouter extends Router {
    create(app: Express, server: HomelabServer): ExpressRouter {
        const router = express.Router();

        const auth = createApiAuthMiddleware(server.jwtSecret);

        router.use("/api/traefik", rateLimitMiddleware(apiRateLimiter), auth);

        const traefikDir = () => process.env.HOMELAB_TRAEFIK_DIR || "";
        const configsDir = () => path.join(traefikDir(), "configs");

        // GET /api/traefik/routes - List all route configs
        router.get("/api/traefik/routes", async (_req: Request, res: Response) => {
            try {
                const dir = configsDir();
                fs.mkdirSync(dir, { recursive: true });
                const files = fs.readdirSync(dir).filter(f => f.endsWith(".yml"));
                const routes: TraefikRouteInfo[] = [];
                for (const file of files) {
                    const name = file.replace(/\.yml$/, "");
                    const filePath = path.join(dir, file);
                    const content = fs.readFileSync(filePath, "utf-8");
                    const stat = fs.statSync(filePath);
                    routes.push({ name,
                        content,
                        lastModified: stat.mtime.toISOString() });
                }
                res.json(routes);
            } catch (e) {
                log.error("traefik-api", e);
                res.status(500).json({ error: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // GET /api/traefik/routes/:name - Get single route config
        router.get("/api/traefik/routes/:name", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                if (!ROUTE_NAME_REGEX.test(name)) {
                    res.status(400).json({ error: "invalid name" });
                    return;
                }
                const filePath = path.join(configsDir(), `${name}.yml`);
                if (!fs.existsSync(filePath)) {
                    res.status(404).json({ error: "not found" });
                    return;
                }
                const content = fs.readFileSync(filePath, "utf-8");
                const stat = fs.statSync(filePath);
                res.json({ name,
                    content,
                    lastModified: stat.mtime.toISOString() });
            } catch (e) {
                log.error("traefik-api", e);
                res.status(500).json({ error: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // PUT /api/traefik/routes/:name - Create or update route config
        router.put("/api/traefik/routes/:name", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                if (!ROUTE_NAME_REGEX.test(name)) {
                    res.status(400).json({ error: "invalid name" });
                    return;
                }
                const { content } = req.body as { content?: string };
                if (typeof content !== "string") {
                    res.status(400).json({ error: "missing content" });
                    return;
                }
                const yamlCheck = validateYaml(content);
                if (!yamlCheck.valid) {
                    res.status(400).json({ error: `invalid YAML: ${yamlCheck.error}` });
                    return;
                }
                const result = writeRouteFile(configsDir(), name, content);
                res.json(result);
            } catch (e) {
                log.error("traefik-api", e);
                res.status(500).json({ error: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // DELETE /api/traefik/routes/:name - Delete route config
        router.delete("/api/traefik/routes/:name", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                if (!ROUTE_NAME_REGEX.test(name)) {
                    res.status(400).json({ error: "invalid name" });
                    return;
                }
                const filePath = path.join(configsDir(), `${name}.yml`);
                if (!fs.existsSync(filePath)) {
                    res.status(404).json({ error: "not found" });
                    return;
                }
                fs.unlinkSync(filePath);
                res.status(204).send();
            } catch (e) {
                log.error("traefik-api", e);
                res.status(500).json({ error: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // GET /api/traefik/static - Get static config
        router.get("/api/traefik/static", async (_req: Request, res: Response) => {
            try {
                const staticPath = path.join(traefikDir(), "traefik.yml");
                if (!fs.existsSync(staticPath)) {
                    res.status(404).json({ error: "not found" });
                    return;
                }
                const content = fs.readFileSync(staticPath, "utf-8");
                const stat = fs.statSync(staticPath);
                res.json({ content,
                    lastModified: stat.mtime.toISOString() });
            } catch (e) {
                log.error("traefik-api", e);
                res.status(500).json({ error: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // PUT /api/traefik/static - Update static config
        router.put("/api/traefik/static", async (req: Request, res: Response) => {
            try {
                const { content } = req.body as { content?: string };
                if (typeof content !== "string") {
                    res.status(400).json({ error: "missing content" });
                    return;
                }
                const yamlCheck = validateYaml(content);
                if (!yamlCheck.valid) {
                    res.status(400).json({ error: `invalid YAML: ${yamlCheck.error}` });
                    return;
                }
                const dir = traefikDir();
                if (!dir) {
                    res.status(500).json({ error: "HOMELAB_TRAEFIK_DIR not configured" });
                    return;
                }
                fs.mkdirSync(dir, { recursive: true });
                const staticPath = path.join(dir, "traefik.yml");
                fs.writeFileSync(staticPath, content, "utf-8");
                const stat = fs.statSync(staticPath);
                res.json({ content,
                    lastModified: stat.mtime.toISOString() });
            } catch (e) {
                log.error("traefik-api", e);
                res.status(500).json({ error: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        return router;
    }
}
