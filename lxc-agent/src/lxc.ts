import { spawn } from "promisify-child-process";
import * as fs from "fs";
import * as path from "path";
import { AgentTerminal, SocketLike, TERMINAL_ROWS } from "./terminal";

const LXC_PATH = "/var/lib/lxc";

export const UNKNOWN = 0;
export const RUNNING = 3;
export const EXITED = 4;
export const FROZEN = 5;
export const STACK_TYPE_LXC = "lxc";

export interface ContainerInfo {
    name: string;
    status: number;
    type: string;
    tags: string[];
    endpoint: string;
    ip: string;
    autostart: boolean;
    pid: number;
    memory: string;
    config: string;
    isManagedByHomelab: boolean;
}

export interface ContainerSimple {
    name: string;
    status: number;
    type: string;
    tags: string[];
    endpoint: string;
    isManagedByHomelab: boolean;
}

function getLxcTerminalName(endpoint: string, name: string) {
    return `lxc-${endpoint}-${name}`;
}

function getLxcExecTerminalName(endpoint: string, name: string, index: number) {
    return `lxc-exec-${endpoint}-${name}-${index}`;
}

function statusConvert(state: string): number {
    switch (state.toUpperCase().trim()) {
        case "RUNNING": return RUNNING;
        case "STOPPED": return EXITED;
        case "FROZEN": return FROZEN;
        default: return UNKNOWN;
    }
}

function parseLxcLsOutput(stdout: string): Array<Record<string, string>> {
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) {
        return [];
    }

    const headerLine = lines[0];
    const headers: string[] = [];
    const positions: number[] = [];

    const headerMatch = headerLine.match(/\S+/g);
    if (!headerMatch) {
        return [];
    }

    for (const header of headerMatch) {
        const searchFrom = positions.length > 0
            ? positions[positions.length - 1] + headers[headers.length - 1].length
            : 0;
        const idx = headerLine.indexOf(header, searchFrom);
        headers.push(header.toLowerCase());
        positions.push(idx);
    }

    const results: Array<Record<string, string>> = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim() || line.startsWith("-")) {
            continue;
        }
        const row: Record<string, string> = {};
        for (let j = 0; j < headers.length; j++) {
            const start = positions[j];
            const end = j + 1 < positions.length ? positions[j + 1] : line.length;
            row[headers[j]] = line.substring(start, end).trim();
        }
        results.push(row);
    }
    return results;
}

function readConfig(name: string): string {
    try {
        return fs.readFileSync(path.join(LXC_PATH, name, "config"), "utf-8");
    } catch {
        return "";
    }
}

export async function getContainerList(endpoint: string): Promise<Record<string, ContainerSimple>> {
    const result: Record<string, ContainerSimple> = {};
    try {
        const res = await spawn("lxc-ls", [ "-f", "-F", "name,state" ], { encoding: "utf-8" });
        if (!res.stdout) {
            return result;
        }
        const rows = parseLxcLsOutput(res.stdout.toString());
        for (const row of rows) {
            const name = row["name"];
            if (!name) {
                continue;
            }
            result[name] = {
                name,
                status: statusConvert(row["state"] || ""),
                type: STACK_TYPE_LXC,
                tags: [],
                endpoint,
                isManagedByHomelab: true,
            };
        }
    } catch (e) {
        console.error("[lxc] Failed to get container list:", e instanceof Error ? e.message : e);
    }
    return result;
}

export async function getContainer(name: string, endpoint: string): Promise<ContainerInfo> {
    if (!/^[a-z0-9_.-]+$/.test(name)) {
        throw new Error("Invalid LXC container name");
    }

    const res = await spawn("lxc-info", [ "-n", name ], { encoding: "utf-8" });
    if (!res.stdout) {
        throw new Error("LXC container not found");
    }

    const output = res.stdout.toString();
    let status = UNKNOWN;
    let ip = "";
    let pid = 0;
    let memory = "";

    const stateMatch = output.match(/^State:\s+(.+)$/m);
    if (stateMatch) {
        status = statusConvert(stateMatch[1]);
    }
    const ipMatch = output.match(/^IP:\s+(.+)$/m);
    if (ipMatch) {
        ip = ipMatch[1].trim();
    }
    const pidMatch = output.match(/^PID:\s+(.+)$/m);
    if (pidMatch) {
        pid = parseInt(pidMatch[1].trim(), 10) || 0;
    }
    const memMatch = output.match(/^Memory use:\s+(.+)$/m);
    if (memMatch) {
        memory = memMatch[1].trim();
    }

    return {
        name,
        status,
        type: STACK_TYPE_LXC,
        tags: [],
        endpoint,
        ip,
        autostart: false,
        pid,
        memory,
        config: readConfig(name),
        isManagedByHomelab: true,
    };
}

export async function startContainer(socket: SocketLike, endpoint: string, name: string): Promise<void> {
    const code = await AgentTerminal.exec(socket, getLxcTerminalName(endpoint, name), "lxc-start", [ "-n", name ], LXC_PATH);
    if (code !== 0) {
        throw new Error("Failed to start LXC container");
    }
}

export async function stopContainer(socket: SocketLike, endpoint: string, name: string): Promise<void> {
    const code = await AgentTerminal.exec(socket, getLxcTerminalName(endpoint, name), "lxc-stop", [ "-n", name ], LXC_PATH);
    if (code !== 0) {
        throw new Error("Failed to stop LXC container");
    }
}

export async function restartContainer(socket: SocketLike, endpoint: string, name: string): Promise<void> {
    const termName = getLxcTerminalName(endpoint, name);
    const stopCode = await AgentTerminal.exec(socket, termName, "lxc-stop", [ "-n", name ], LXC_PATH);
    if (stopCode !== 0) {
        throw new Error("Failed to stop LXC container for restart");
    }
    const startCode = await AgentTerminal.exec(socket, termName, "lxc-start", [ "-n", name ], LXC_PATH);
    if (startCode !== 0) {
        throw new Error("Failed to start LXC container for restart");
    }
}

export async function freezeContainer(socket: SocketLike, endpoint: string, name: string): Promise<void> {
    const code = await AgentTerminal.exec(socket, getLxcTerminalName(endpoint, name), "lxc-freeze", [ "-n", name ], LXC_PATH);
    if (code !== 0) {
        throw new Error("Failed to freeze LXC container");
    }
}

export async function unfreezeContainer(socket: SocketLike, endpoint: string, name: string): Promise<void> {
    const code = await AgentTerminal.exec(socket, getLxcTerminalName(endpoint, name), "lxc-unfreeze", [ "-n", name ], LXC_PATH);
    if (code !== 0) {
        throw new Error("Failed to unfreeze LXC container");
    }
}

export async function deleteContainer(socket: SocketLike, endpoint: string, name: string, status: number): Promise<void> {
    const termName = getLxcTerminalName(endpoint, name);
    if (status === RUNNING || status === FROZEN) {
        await AgentTerminal.exec(socket, termName, "lxc-stop", [ "-n", name ], LXC_PATH);
    }
    const code = await AgentTerminal.exec(socket, termName, "lxc-destroy", [ "-n", name ], LXC_PATH);
    if (code !== 0) {
        throw new Error("Failed to destroy LXC container");
    }
}

export async function saveConfig(name: string, config: string): Promise<void> {
    const containerPath = path.join(LXC_PATH, name);
    if (!fs.existsSync(containerPath)) {
        throw new Error("LXC container not found");
    }
    await fs.promises.writeFile(path.join(containerPath, "config"), config);
}

export async function createContainer(
    socket: SocketLike,
    endpoint: string,
    name: string,
    dist: string,
    release: string,
    arch: string,
): Promise<void> {
    if (!/^[a-z0-9_.-]+$/.test(name)) {
        throw new Error("Invalid container name");
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(dist)) {
        throw new Error("Invalid distribution name");
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(release)) {
        throw new Error("Invalid release name");
    }
    if (!/^[a-zA-Z0-9_]+$/.test(arch)) {
        throw new Error("Invalid architecture");
    }

    const code = await AgentTerminal.exec(
        socket,
        getLxcTerminalName(endpoint, name),
        "lxc-create",
        [ "-n", name, "-t", "download", "--", "--dist", dist, "--release", release, "--arch", arch ],
        LXC_PATH,
    );
    if (code !== 0) {
        throw new Error("Failed to create LXC container");
    }
}

export async function getDistributions(): Promise<object[]> {
    const distributions: object[] = [];
    try {
        const res = await spawn("lxc-create", [ "-t", "download", "--", "--list" ], {
            encoding: "utf-8",
            timeout: 30000,
        });
        if (!res.stdout) {
            return distributions;
        }
        const lines = res.stdout.toString().trim().split("\n");
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 3 && parts[0] !== "DIST" && !line.startsWith("-")) {
                distributions.push({
                    dist: parts[0],
                    release: parts[1],
                    arch: parts[2],
                    variant: parts[3] || "default",
                });
            }
        }
    } catch (e) {
        console.error("[lxc] Failed to get distributions:", e instanceof Error ? e.message : e);
    }
    return distributions;
}

export function joinExecTerminal(socket: SocketLike, endpoint: string, name: string, shell: string): void {
    const terminalName = getLxcExecTerminalName(endpoint, name, 0);
    let terminal = AgentTerminal.getTerminal(terminalName);

    if (!terminal) {
        terminal = new AgentTerminal(socket, terminalName, "lxc-attach", [ "-n", name, "--", shell ], LXC_PATH);
        terminal.rows = TERMINAL_ROWS;
    } else {
        // Update socket reference so output goes to the current connection
        terminal.socket = socket;
    }

    terminal.start();
}
