import { createServer, Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { spawn } from "promisify-child-process";
import * as lxc from "./lxc";
import { AgentTerminal } from "./terminal";

export interface AgentConfig {
    username: string;
    password: string;
    version: string;
    scanInterval: number;
}

export interface Capabilities {
    lxcAvailable: boolean;
}

async function detectCapabilities(): Promise<Capabilities> {
    let lxcAvailable = false;
    try {
        await spawn("lxc-ls", [ "--version" ], { encoding: "utf8" });
        lxcAvailable = true;
    } catch {
        // lxc-ls not found or failed
    }

    const found: string[] = [];
    if (lxcAvailable) {
        found.push("LXC");
    }

    if (found.length > 0) {
        console.log(`[agent] Capabilities detected: ${found.join(", ")}`);
    } else {
        console.log("[agent] No additional capabilities detected");
    }

    return { lxcAvailable };
}

type Callback = (res: object) => void;

export function createAgentServer(config: AgentConfig): { io: Server; httpServer: HttpServer } {
    const httpServer = createServer();
    const io = new Server(httpServer);

    let capabilities: Capabilities = { lxcAvailable: false };
    const authenticatedSockets = new Set<Socket>();

    const emitInfo = (socket: Socket) => {
        socket.emit("info", {
            version: config.version,
            ...capabilities,
        });
    };

    const rescan = async () => {
        console.log("[agent] Scanning capabilities...");
        capabilities = await detectCapabilities();
        for (const socket of authenticatedSockets) {
            emitInfo(socket);
        }
    };

    // Initial scan, then periodic rescan
    rescan().then(() => {
        setInterval(rescan, config.scanInterval * 1000);
    });

    io.on("connection", (socket: Socket) => {
        // The main server sends its own endpoint string in the header so we can
        // echo it back in push events (lxcContainerList, terminalWrite, etc.)
        const endpoint = (socket.handshake.headers["endpoint"] as string) || "";
        let loggedIn = false;

        console.log(`[agent] Main server connected (endpoint: ${endpoint || "<none>"})`);

        // Announce ourselves with current capabilities — main server checks version >= 1.4.0
        emitInfo(socket);

        socket.on("disconnect", () => {
            console.log("[agent] Main server disconnected");
            authenticatedSockets.delete(socket);
            // Leave interactive terminals open (lxc-attach) across reconnects;
            // only clean up non-interactive progress terminals which are already
            // gone by the time the process exits.
        });

        socket.on("login", (data: unknown, callback: unknown) => {
            const cb = typeof callback === "function" ? (callback as Callback) : null;

            if (typeof data !== "object" || data === null) {
                cb?.({ ok: false,
                    msg: "Invalid login data" });
                return;
            }

            const { username, password } = data as { username?: string; password?: string };

            if (username === config.username && password === config.password) {
                loggedIn = true;
                authenticatedSockets.add(socket);
                console.log(`[agent] Authenticated as ${username}`);
                cb?.({ ok: true });
            } else {
                console.warn(`[agent] Login failed for ${username}`);
                cb?.({ ok: false,
                    msg: "Invalid credentials" });
            }
        });

        // The main server proxies browser requests as:
        //   socket.emit("agent", targetEndpoint, eventName, ...args)
        socket.on("agent", async (targetEndpoint: unknown, eventName: unknown, ...args: unknown[]) => {
            if (!loggedIn) {
                return;
            }
            if (typeof targetEndpoint !== "string" || typeof eventName !== "string") {
                return;
            }
            // Only handle events addressed to this endpoint (or broadcast)
            if (targetEndpoint !== endpoint && targetEndpoint !== "") {
                return;
            }

            await dispatch(socket, endpoint, eventName, args);
        });
    });

    return { io,
        httpServer };
}

async function dispatch(socket: Socket, endpoint: string, eventName: string, args: unknown[]): Promise<void> {
    // Pop ack callback if the last argument is a function
    const callback = typeof args[args.length - 1] === "function"
        ? (args.pop() as Callback)
        : null;

    const ok = (msg?: string, extra?: object) =>
        callback?.({ ok: true,
            ...(msg ? { msg,
                msgi18n: true } : {}),
            ...extra });
    const fail = (e: unknown) =>
        callback?.({ ok: false,
            msg: e instanceof Error ? e.message : String(e) });

    const pushList = async () => {
        const list = await lxc.getContainerList(endpoint);
        socket.emit("agent", "lxcContainerList", { ok: true,
            lxcContainerList: list,
            endpoint });
    };

    try {
        switch (eventName) {

            case "requestLxcContainerList": {
                await pushList();
                ok("Updated");
                break;
            }

            case "getLxcContainer": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                const container = await lxc.getContainer(name, endpoint);
                callback?.({ ok: true,
                    container });
                break;
            }

            case "startLxcContainer": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                await lxc.startContainer(socket, endpoint, name);
                ok("Started");
                await pushList();
                break;
            }

            case "stopLxcContainer": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                await lxc.stopContainer(socket, endpoint, name);
                ok("Stopped");
                await pushList();
                break;
            }

            case "restartLxcContainer": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                await lxc.restartContainer(socket, endpoint, name);
                ok("Restarted");
                await pushList();
                break;
            }

            case "freezeLxcContainer": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                await lxc.freezeContainer(socket, endpoint, name);
                ok("Frozen");
                await pushList();
                break;
            }

            case "unfreezeLxcContainer": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                await lxc.unfreezeContainer(socket, endpoint, name);
                ok("Unfrozen");
                await pushList();
                break;
            }

            case "deleteLxcContainer": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                const container = await lxc.getContainer(name, endpoint);
                await lxc.deleteContainer(socket, endpoint, name, container.status);
                await pushList();
                ok("Destroyed");
                break;
            }

            case "saveLxcConfig": {
                const [ name, configContent ] = args as [string, string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                if (typeof configContent !== "string") {
                    throw new Error("Config must be a string");
                }
                await lxc.saveConfig(name, configContent);
                ok("Saved");
                break;
            }

            case "createLxcContainer": {
                const [ name, dist, release, arch ] = args as [string, string, string, string];
                await lxc.createContainer(socket, endpoint, name, dist, release, arch);
                await pushList();
                ok("Created");
                break;
            }

            case "getLxcDistributions": {
                const distributions = await lxc.getDistributions();
                callback?.({ ok: true,
                    distributions });
                break;
            }

            case "lxcExecTerminal": {
                const [ name, shell ] = args as [string, string];
                if (typeof name !== "string") {
                    throw new Error("Name must be a string");
                }
                if (typeof shell !== "string") {
                    throw new Error("Shell must be a string");
                }
                lxc.joinExecTerminal(socket, endpoint, name, shell);
                ok();
                break;
            }

            case "terminalInput": {
                const [ terminalName, cmd ] = args as [string, string];
                if (typeof terminalName !== "string") {
                    throw new Error("Terminal name must be a string");
                }
                if (typeof cmd !== "string") {
                    throw new Error("Command must be a string");
                }
                const terminal = AgentTerminal.getTerminal(terminalName);
                if (!terminal) {
                    throw new Error("Terminal not found");
                }
                terminal.write(cmd);
                break;
            }

            case "terminalJoin": {
                const [ terminalName ] = args as [string];
                if (typeof terminalName !== "string") {
                    throw new Error("Terminal name must be a string");
                }
                const buffer = AgentTerminal.getTerminal(terminalName)?.getBuffer() ?? "";
                callback?.({ ok: true,
                    buffer });
                break;
            }

            case "terminalResize": {
                const [ terminalName, rows, cols ] = args as [string, number, number];
                if (typeof terminalName !== "string") {
                    break;
                }
                const terminal = AgentTerminal.getTerminal(terminalName);
                if (terminal) {
                    if (typeof rows === "number") {
                        terminal.rows = rows;
                    }
                    if (typeof cols === "number") {
                        terminal.cols = cols;
                    }
                }
                break;
            }

            default:
                console.warn(`[agent] Unknown event: ${eventName}`);
        }
    } catch (e) {
        fail(e);
    }
}
