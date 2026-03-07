import { HomelabServer } from "../homelab-server";
import { Router } from "../router";
import express, { Express, Request, Response, Router as ExpressRouter } from "express";
import { Stack } from "../stack";
import { RUNNING, EXITED, CREATED_FILE, CREATED_STACK } from "../../common/util-common";
import { ValidationError, createApiAuthMiddleware } from "../util-server";
import childProcessAsync from "promisify-child-process";
import { log } from "../log";
import { apiRateLimiter, rateLimitMiddleware } from "../rate-limiter";
import fs from "fs";
import { Agent } from "../models/agent";

const STACK_NAME_REGEX = /^[a-z0-9_-]+$/;

export interface ContainerInfo {
    name: string;
    service: string;
    image: string;
    state: string;
    status: string;
    health: string;
    ports: string[];
}

export interface StackInfo {
    name: string;
    status: string;
    composeYaml: string;
    envFile: string;
    composeOverride: string;
    autostart: boolean;
    displayName: string;
    containers: ContainerInfo[];
}

export function statusNumberToString(status: number): string {
    switch (status) {
        case RUNNING:
            return "running";
        case EXITED:
            return "exited";
        case CREATED_FILE:
        case CREATED_STACK:
            return "created";
        default:
            return "unknown";
    }
}

export function parseContainerJSON(output: string): ContainerInfo[] {
    if (!output || !output.trim()) {
        return [];
    }
    const containers: ContainerInfo[] = [];
    const lines = output.split("\n");
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        try {
            const obj = JSON.parse(trimmed);
            const ports = (obj.Ports as string || "").split(/,\s*/).filter((s: string) => s.length > 0);
            containers.push({
                name: obj.Name || "",
                service: obj.Service || "",
                image: obj.Image || "",
                state: obj.State || "",
                status: obj.Status || "",
                health: obj.Health || "",
                ports,
            });
        } catch {
            // Skip non-JSON lines
        }
    }
    return containers;
}

async function getContainerInfo(stack: Stack): Promise<ContainerInfo[]> {
    try {
        const res = await childProcessAsync.spawn("docker", stack.getComposeOptions("ps", "--format", "json"), {
            cwd: stack.path,
            encoding: "utf-8",
        });
        return parseContainerJSON(res.stdout?.toString() || "");
    } catch {
        return [];
    }
}

async function stackToInfo(stack: Stack): Promise<StackInfo> {
    const containers = await getContainerInfo(stack);
    return {
        name: stack.name,
        status: statusNumberToString(stack.status),
        composeYaml: stack.composeYAML,
        envFile: stack.composeENV,
        composeOverride: "",
        autostart: false,
        displayName: "",
        containers,
    };
}

export class StackApiRouter extends Router {
    create(app: Express, server: HomelabServer): ExpressRouter {
        const router = express.Router();

        const auth = createApiAuthMiddleware(server.jwtSecret);

        router.use("/api/stacks", rateLimitMiddleware(apiRateLimiter), auth);
        router.use("/api/agents", rateLimitMiddleware(apiRateLimiter), auth);

        // GET /api/agents - List all configured agents with their capabilities
        router.get("/api/agents", async (_req: Request, res: Response) => {
            try {
                const agentList = await Agent.getAgentList();
                const caps = server.serverAgentManager?.agentCapabilities ?? {};
                const agents: object[] = Object.values(agentList).map(agent => ({
                    ...agent.toJSON(),
                    capabilities: caps[agent.endpoint] ?? {},
                }));
                // Include the local server as endpoint ""
                agents.unshift({
                    url: "",
                    username: "",
                    endpoint: "",
                    capabilities: {
                        lxcAvailable: server.lxcAvailable,
                        version: server.packageJSON.version,
                    },
                });
                res.json({ ok: true,
                    agents });
            } catch (e) {
                log.error("agent-api", e);
                res.status(500).json({ ok: false,
                    msg: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // GET /api/stacks - List all stacks
        router.get("/api/stacks", async (_req: Request, res: Response) => {
            try {
                const stackList = await Stack.getStackList(server);
                const results: StackInfo[] = [];
                for (const [ , stack ] of stackList) {
                    await stack.updateStatus();
                    results.push(await stackToInfo(stack));
                }
                res.json(results);
            } catch (e) {
                log.error("stack-api", e);
                res.status(500).json({ message: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // GET /api/stacks/:name - Get single stack
        router.get("/api/stacks/:name", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                if (!STACK_NAME_REGEX.test(name)) {
                    res.status(400).json({ message: "Invalid stack name" });
                    return;
                }
                try {
                    const stack = await Stack.getStack(server, name);
                    await stack.updateStatus();
                    res.json(await stackToInfo(stack));
                } catch {
                    res.status(404).json({ message: "Stack not found" });
                }
            } catch (e) {
                log.error("stack-api", e);
                res.status(500).json({ message: e instanceof Error ? e.message : "Internal server error" });
            }
        });

        // POST /api/stacks - Create stack
        router.post("/api/stacks", async (req: Request, res: Response) => {
            try {
                const { name, composeYaml, envFile, start } = req.body as {
                    name?: string;
                    composeYaml?: string;
                    envFile?: string;
                    start?: boolean;
                };

                if (!name || !composeYaml) {
                    res.status(400).json({ message: "Missing required fields: name, composeYaml" });
                    return;
                }

                if (!STACK_NAME_REGEX.test(name)) {
                    res.status(400).json({ message: "Stack name can only contain [a-z][0-9] _ - characters" });
                    return;
                }

                const stack = new Stack(server, name, composeYaml, envFile || "");
                await stack.save(true);

                if (start !== false) {
                    await childProcessAsync.spawn("docker", stack.getComposeOptions("up", "-d", "--remove-orphans"), {
                        cwd: stack.path,
                        encoding: "utf-8",
                    });
                }

                await stack.updateStatus();

                try {
                    await server.sendStackList();
                } catch (e) {
                    log.warn("stack-api", "Failed to broadcast stack list: " + e);
                }

                res.status(201).json(await stackToInfo(stack));
            } catch (e) {
                log.error("stack-api", e);
                if (e instanceof ValidationError) {
                    res.status(400).json({ message: e.message });
                } else {
                    res.status(500).json({ message: e instanceof Error ? e.message : "Failed to create stack" });
                }
            }
        });

        // PUT /api/stacks/:name - Update stack
        router.put("/api/stacks/:name", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;
                const { composeYaml, envFile } = req.body as {
                    composeYaml?: string;
                    envFile?: string;
                };

                if (!STACK_NAME_REGEX.test(name)) {
                    res.status(400).json({ message: "Invalid stack name" });
                    return;
                }

                let stack: Stack;
                try {
                    stack = await Stack.getStack(server, name);
                } catch {
                    res.status(404).json({ message: "Stack not found" });
                    return;
                }

                await stack.updateStatus();
                const wasRunning = stack.status === RUNNING;

                // Create a new Stack instance with updated content to save
                const updatedStack = new Stack(server, name, composeYaml ?? stack.composeYAML, envFile ?? stack.composeENV);
                await updatedStack.save(false);

                if (wasRunning) {
                    await childProcessAsync.spawn("docker", updatedStack.getComposeOptions("up", "-d", "--remove-orphans"), {
                        cwd: updatedStack.path,
                        encoding: "utf-8",
                    });
                }

                await updatedStack.updateStatus();

                try {
                    await server.sendStackList();
                } catch (e) {
                    log.warn("stack-api", "Failed to broadcast stack list: " + e);
                }

                res.json(await stackToInfo(updatedStack));
            } catch (e) {
                log.error("stack-api", e);
                if (e instanceof ValidationError) {
                    res.status(400).json({ message: e.message });
                } else {
                    res.status(500).json({ message: e instanceof Error ? e.message : "Failed to update stack" });
                }
            }
        });

        // DELETE /api/stacks/:name - Delete stack
        router.delete("/api/stacks/:name", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;

                if (!STACK_NAME_REGEX.test(name)) {
                    res.status(400).json({ message: "Invalid stack name" });
                    return;
                }

                let stack: Stack;
                try {
                    stack = await Stack.getStack(server, name);
                } catch {
                    res.status(404).json({ message: "Stack not found" });
                    return;
                }

                // Try to bring down the compose stack (ignore failure if never deployed)
                try {
                    await childProcessAsync.spawn("docker", stack.getComposeOptions("down", "--remove-orphans"), {
                        cwd: stack.path,
                        encoding: "utf-8",
                    });
                } catch {
                    // Ignore - stack may never have been deployed
                }

                // Remove the stack folder
                await fs.promises.rm(stack.path, {
                    recursive: true,
                    force: true
                });

                try {
                    await server.sendStackList();
                } catch (e) {
                    log.warn("stack-api", "Failed to broadcast stack list: " + e);
                }

                res.status(204).send();
            } catch (e) {
                log.error("stack-api", e);
                res.status(500).json({ message: e instanceof Error ? e.message : "Failed to delete stack" });
            }
        });

        // POST /api/stacks/:name/start - Start stack
        router.post("/api/stacks/:name/start", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;

                if (!STACK_NAME_REGEX.test(name)) {
                    res.status(400).json({ message: "Invalid stack name" });
                    return;
                }

                let stack: Stack;
                try {
                    stack = await Stack.getStack(server, name);
                } catch {
                    res.status(404).json({ message: "Stack not found" });
                    return;
                }

                await childProcessAsync.spawn("docker", stack.getComposeOptions("up", "-d", "--remove-orphans"), {
                    cwd: stack.path,
                    encoding: "utf-8",
                });

                await stack.updateStatus();

                try {
                    await server.sendStackList();
                } catch (e) {
                    log.warn("stack-api", "Failed to broadcast stack list: " + e);
                }

                res.json(await stackToInfo(stack));
            } catch (e) {
                log.error("stack-api", e);
                res.status(500).json({ message: e instanceof Error ? e.message : "Failed to start stack" });
            }
        });

        // POST /api/stacks/:name/stop - Stop stack
        router.post("/api/stacks/:name/stop", async (req: Request, res: Response) => {
            try {
                const { name } = req.params;

                if (!STACK_NAME_REGEX.test(name)) {
                    res.status(400).json({ message: "Invalid stack name" });
                    return;
                }

                let stack: Stack;
                try {
                    stack = await Stack.getStack(server, name);
                } catch {
                    res.status(404).json({ message: "Stack not found" });
                    return;
                }

                await childProcessAsync.spawn("docker", stack.getComposeOptions("stop"), {
                    cwd: stack.path,
                    encoding: "utf-8",
                });

                await stack.updateStatus();

                try {
                    await server.sendStackList();
                } catch (e) {
                    log.warn("stack-api", "Failed to broadcast stack list: " + e);
                }

                res.json(await stackToInfo(stack));
            } catch (e) {
                log.error("stack-api", e);
                res.status(500).json({ message: e instanceof Error ? e.message : "Failed to stop stack" });
            }
        });

        return router;
    }
}
