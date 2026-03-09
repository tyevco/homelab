import { createServer, Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { promises as fs } from "fs";
import { spawn } from "promisify-child-process";
import * as ini from "ini";

export interface AgentConfig {
    username: string;
    password: string;
    version: string;
    scanInterval: number;
}

export interface Capabilities {
    unraidAvailable: boolean;
}

const DISKS_INI = "/var/local/emhttp/disks.ini";
const SHARES_INI = "/var/local/emhttp/shares.ini";
const VMS_INI = "/var/local/emhttp/vms.ini";
const MDCMD = "/proc/mdcmd";

async function detectCapabilities(): Promise<Capabilities> {
    let unraidAvailable = false;
    try {
        await fs.access(DISKS_INI);
        unraidAvailable = true;
    } catch {
        // Not an Unraid host
    }

    if (unraidAvailable) {
        console.log("[agent] Capabilities detected: Unraid");
    } else {
        console.log("[agent] Unraid not detected");
    }

    return { unraidAvailable };
}

type Callback = (res: object) => void;

export function createAgentServer(config: AgentConfig): { io: Server; httpServer: HttpServer } {
    const httpServer = createServer();
    const io = new Server(httpServer);

    let capabilities: Capabilities = { unraidAvailable: false };
    const authenticatedSockets = new Map<Socket, string>();

    const emitInfo = (socket: Socket) => {
        socket.emit("info", {
            version: config.version,
            ...capabilities,
        });
    };

    const rescan = async () => {
        console.log("[agent] Scanning capabilities...");
        capabilities = await detectCapabilities();
        for (const [ socket ] of authenticatedSockets) {
            emitInfo(socket);
        }
    };

    rescan().then(() => {
        setInterval(rescan, config.scanInterval * 1000);
    });

    io.on("connection", (socket: Socket) => {
        const endpoint = (socket.handshake.headers["endpoint"] as string) || "";
        let loggedIn = false;

        console.log(`[agent] Main server connected (endpoint: ${endpoint || "<none>"})`);

        emitInfo(socket);

        socket.on("disconnect", () => {
            console.log("[agent] Main server disconnected");
            authenticatedSockets.delete(socket);
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
                authenticatedSockets.set(socket, endpoint);
                console.log(`[agent] Authenticated as ${username}`);
                cb?.({ ok: true });
            } else {
                console.warn(`[agent] Login failed for ${username}`);
                cb?.({ ok: false,
                    msg: "Invalid credentials" });
            }
        });

        socket.on("agent", async (targetEndpoint: unknown, eventName: unknown, ...args: unknown[]) => {
            if (!loggedIn) {
                return;
            }
            if (typeof targetEndpoint !== "string" || typeof eventName !== "string") {
                return;
            }
            if (targetEndpoint !== endpoint && targetEndpoint !== "") {
                return;
            }

            console.log(`[agent] Event: ${eventName}`);
            await dispatch(eventName, args);
        });
    });

    return { io,
        httpServer };
}

async function dispatch(eventName: string, args: unknown[]): Promise<void> {
    const callback = typeof args[args.length - 1] === "function"
        ? (args.pop() as Callback)
        : null;

    const ok = (data?: object) =>
        callback?.({ ok: true,
            ...data });
    const fail = (e: unknown) => {
        console.error(`[agent] Error handling ${eventName}:`, e instanceof Error ? e.message : String(e));
        callback?.({ ok: false,
            msg: e instanceof Error ? e.message : String(e) });
    };

    try {
        switch (eventName) {

            case "getUnraidDisks": {
                const content = await fs.readFile(DISKS_INI, "utf8");
                const parsed = ini.parse(content);
                const disks = Object.values(parsed).filter((v) => typeof v === "object");
                ok({ data: disks });
                break;
            }

            case "getUnraidArrayStatus": {
                const content = await fs.readFile(MDCMD, "utf8");
                // Parse key=value lines from /proc/mdcmd
                const result: Record<string, string> = {};
                for (const line of content.split("\n")) {
                    const eq = line.indexOf("=");
                    if (eq !== -1) {
                        result[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
                    }
                }
                ok({ data: result });
                break;
            }

            case "getUnraidShares": {
                const content = await fs.readFile(SHARES_INI, "utf8");
                const parsed = ini.parse(content);
                const shares = Object.values(parsed).filter((v) => typeof v === "object");
                ok({ data: shares });
                break;
            }

            case "getUnraidVms": {
                const content = await fs.readFile(VMS_INI, "utf8");
                const parsed = ini.parse(content);
                const vms = Object.values(parsed).filter((v) => typeof v === "object");
                ok({ data: vms });
                break;
            }

            case "startUnraidVm": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("VM name must be a string");
                }
                await spawn("virsh", [ "start", name ], { encoding: "utf8" });
                ok({ msg: "Started",
                    msgi18n: true });
                break;
            }

            case "stopUnraidVm": {
                const [ name ] = args as [string];
                if (typeof name !== "string") {
                    throw new Error("VM name must be a string");
                }
                await spawn("virsh", [ "shutdown", name ], { encoding: "utf8" });
                ok({ msg: "Stopped",
                    msgi18n: true });
                break;
            }

            default:
                console.warn(`[agent] Unknown event: ${eventName}`);
        }
    } catch (e) {
        fail(e);
    }
}
