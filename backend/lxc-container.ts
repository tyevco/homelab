import { HomelabServer } from "./homelab-server";
import fs, { promises as fsAsync } from "fs";
import { log } from "./log";
import { HomelabSocket, ValidationError } from "./util-server";
import path from "path";
import {
    EXITED,
    FROZEN,
    getLxcTerminalName,
    getLxcExecTerminalName,
    RUNNING,
    STACK_TYPE_LXC,
    TERMINAL_ROWS,
    UNKNOWN,
} from "../common/util-common";
import { InteractiveTerminal, Terminal } from "./terminal";
import childProcessAsync from "promisify-child-process";

const LXC_PATH = "/var/lib/lxc";

export class LxcContainer {

    name: string;
    protected _status: number = UNKNOWN;
    protected _ip?: string;
    protected _autostart?: boolean;
    protected _pid?: number;
    protected _memory?: string;
    protected _config?: string;
    protected server: HomelabServer;

    protected static cachedContainerList: Map<string, LxcContainer> = new Map();

    constructor(server: HomelabServer, name: string) {
        this.name = name;
        this.server = server;
    }

    toJSON(endpoint: string): object {
        return {
            name: this.name,
            status: this._status,
            type: STACK_TYPE_LXC,
            tags: [],
            endpoint,
            ip: this._ip || "",
            autostart: this._autostart || false,
            pid: this._pid || 0,
            memory: this._memory || "",
            config: this.config,
        };
    }

    toSimpleJSON(endpoint: string): object {
        return {
            name: this.name,
            status: this._status,
            type: STACK_TYPE_LXC,
            tags: [],
            endpoint,
            isManagedByHomelab: true,
        };
    }

    get config(): string {
        if (this._config === undefined) {
            try {
                this._config = fs.readFileSync(path.join(this.path, "config"), "utf-8");
            } catch (e) {
                this._config = "";
            }
        }
        return this._config as string;
    }

    get path(): string {
        return path.join(LXC_PATH, this.name);
    }

    /**
     * Check if LXC tools are available on the system
     */
    static async isLxcAvailable(): Promise<boolean> {
        try {
            await childProcessAsync.exec("which lxc-ls");
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Convert LXC state string to status number
     */
    static statusConvert(state: string): number {
        switch (state.toUpperCase().trim()) {
            case "RUNNING":
                return RUNNING;
            case "STOPPED":
                return EXITED;
            case "FROZEN":
                return FROZEN;
            default:
                return UNKNOWN;
        }
    }

    /**
     * Parse the tabular output of lxc-ls -f
     */
    static parseLxcLsOutput(stdout: string): Array<Record<string, string>> {
        const lines = stdout.trim().split("\n");
        if (lines.length < 2) {
            return [];
        }

        // Parse header to determine column positions
        const headerLine = lines[0];
        const headers: string[] = [];
        const positions: number[] = [];

        // Find column positions from header
        const headerMatch = headerLine.match(/\S+/g);
        if (!headerMatch) {
            return [];
        }

        for (const header of headerMatch) {
            const idx = headerLine.indexOf(header, positions.length > 0 ? positions[positions.length - 1] + headers[headers.length - 1].length : 0);
            headers.push(header.toLowerCase());
            positions.push(idx);
        }

        const results: Array<Record<string, string>> = [];

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === "" || line.startsWith("-")) {
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

    /**
     * Get list of all LXC containers
     */
    static async getContainerList(server: HomelabServer, useCache = false): Promise<Map<string, LxcContainer>> {
        if (useCache && this.cachedContainerList.size > 0) {
            return this.cachedContainerList;
        }

        const containerList = new Map<string, LxcContainer>();

        try {
            const res = await childProcessAsync.spawn("lxc-ls", [ "-f", "-F", "name,state,ipv4,autostart,pid,memory" ], {
                encoding: "utf-8",
            });

            if (!res.stdout) {
                return containerList;
            }

            const rows = this.parseLxcLsOutput(res.stdout.toString());

            for (const row of rows) {
                const name = row["name"];
                if (!name) {
                    continue;
                }

                const container = new LxcContainer(server, name);
                container._status = this.statusConvert(row["state"] || "");
                container._ip = row["ipv4"] || "";
                container._autostart = (row["autostart"] || "").trim() === "1";
                container._pid = parseInt(row["pid"] || "0") || 0;
                container._memory = row["memory"] || "";

                containerList.set(name, container);
            }

            this.cachedContainerList = new Map(containerList);
        } catch (e) {
            if (e instanceof Error) {
                log.warn("lxc", `Failed to get LXC container list: ${e.message}`);
            }
        }

        return containerList;
    }

    /**
     * Get status list for all LXC containers
     */
    static async getStatusList(): Promise<Map<string, number>> {
        const statusList = new Map<string, number>();

        try {
            const res = await childProcessAsync.spawn("lxc-ls", [ "-f", "-F", "name,state" ], {
                encoding: "utf-8",
            });

            if (!res.stdout) {
                return statusList;
            }

            const rows = this.parseLxcLsOutput(res.stdout.toString());

            for (const row of rows) {
                const name = row["name"];
                if (name) {
                    statusList.set(name, this.statusConvert(row["state"] || ""));
                }
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("lxc", `Failed to get LXC status list: ${e.message}`);
            }
        }

        return statusList;
    }

    /**
     * Get a single container by name
     */
    static async getContainer(server: HomelabServer, name: string): Promise<LxcContainer> {
        // Validate name
        if (!name.match(/^[a-zA-Z0-9_.-]+$/)) {
            throw new ValidationError("Invalid LXC container name");
        }

        const container = new LxcContainer(server, name);

        try {
            const res = await childProcessAsync.spawn("lxc-info", [ "-n", name ], {
                encoding: "utf-8",
            });

            if (res.stdout) {
                const output = res.stdout.toString();

                // Parse lxc-info output (key: value format)
                const stateMatch = output.match(/^State:\s+(.+)$/m);
                if (stateMatch) {
                    container._status = LxcContainer.statusConvert(stateMatch[1]);
                }

                const ipMatch = output.match(/^IP:\s+(.+)$/m);
                if (ipMatch) {
                    container._ip = ipMatch[1].trim();
                }

                const pidMatch = output.match(/^PID:\s+(.+)$/m);
                if (pidMatch) {
                    container._pid = parseInt(pidMatch[1].trim()) || 0;
                }

                const memMatch = output.match(/^Memory use:\s+(.+)$/m);
                if (memMatch) {
                    container._memory = memMatch[1].trim();
                }
            }
        } catch (e) {
            if (e instanceof Error) {
                log.warn("lxc", `Failed to get LXC container info for ${name}: ${e.message}`);
            }
            throw new ValidationError("LXC container not found");
        }

        return container;
    }

    /**
     * Get available distributions for creating new containers
     */
    static async getAvailableDistributions(): Promise<object[]> {
        const distributions: object[] = [];

        try {
            const res = await childProcessAsync.spawn("lxc-create", [ "-t", "download", "--", "--list" ], {
                encoding: "utf-8",
                timeout: 30000,
            });

            if (!res.stdout) {
                return distributions;
            }

            const lines = res.stdout.toString().trim().split("\n");

            for (const line of lines) {
                // Format: DIST    RELEASE    ARCH    VARIANT    BUILD
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
            if (e instanceof Error) {
                log.warn("lxc", `Failed to get LXC distributions: ${e.message}`);
            }
        }

        return distributions;
    }

    /**
     * Create a new LXC container
     */
    static async create(server: HomelabServer, socket: HomelabSocket, name: string, dist: string, release: string, arch: string): Promise<number> {
        // Validate inputs
        if (!name.match(/^[a-z0-9_.-]+$/)) {
            throw new ValidationError("Container name can only contain [a-z][0-9] _ . - characters");
        }
        if (!dist.match(/^[a-zA-Z0-9_.-]+$/)) {
            throw new ValidationError("Invalid distribution name");
        }
        if (!release.match(/^[a-zA-Z0-9_.-]+$/)) {
            throw new ValidationError("Invalid release name");
        }
        if (!arch.match(/^[a-zA-Z0-9_]+$/)) {
            throw new ValidationError("Invalid architecture");
        }

        const terminalName = getLxcTerminalName(socket.endpoint, name);
        const exitCode = await Terminal.exec(
            server, socket, terminalName, "lxc-create",
            [ "-n", name, "-t", "download", "--", "--dist", dist, "--release", release, "--arch", arch ],
            LXC_PATH
        );

        if (exitCode !== 0) {
            throw new Error("Failed to create LXC container, please check the terminal output for more information.");
        }

        return exitCode;
    }

    async start(socket: HomelabSocket): Promise<number> {
        const terminalName = getLxcTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "lxc-start", [ "-n", this.name ], LXC_PATH);
        if (exitCode !== 0) {
            throw new Error("Failed to start LXC container, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async stop(socket: HomelabSocket): Promise<number> {
        const terminalName = getLxcTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "lxc-stop", [ "-n", this.name ], LXC_PATH);
        if (exitCode !== 0) {
            throw new Error("Failed to stop LXC container, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async restart(socket: HomelabSocket): Promise<number> {
        const terminalName = getLxcTerminalName(socket.endpoint, this.name);
        let exitCode = await Terminal.exec(this.server, socket, terminalName, "lxc-stop", [ "-n", this.name ], LXC_PATH);
        if (exitCode !== 0) {
            throw new Error("Failed to stop LXC container for restart, please check the terminal output for more information.");
        }
        exitCode = await Terminal.exec(this.server, socket, terminalName, "lxc-start", [ "-n", this.name ], LXC_PATH);
        if (exitCode !== 0) {
            throw new Error("Failed to start LXC container for restart, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async freeze(socket: HomelabSocket): Promise<number> {
        const terminalName = getLxcTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "lxc-freeze", [ "-n", this.name ], LXC_PATH);
        if (exitCode !== 0) {
            throw new Error("Failed to freeze LXC container, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async unfreeze(socket: HomelabSocket): Promise<number> {
        const terminalName = getLxcTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "lxc-unfreeze", [ "-n", this.name ], LXC_PATH);
        if (exitCode !== 0) {
            throw new Error("Failed to unfreeze LXC container, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async delete(socket: HomelabSocket): Promise<number> {
        // Stop first if running
        if (this._status === RUNNING || this._status === FROZEN) {
            const terminalName = getLxcTerminalName(socket.endpoint, this.name);
            await Terminal.exec(this.server, socket, terminalName, "lxc-stop", [ "-n", this.name ], LXC_PATH);
        }

        const terminalName = getLxcTerminalName(socket.endpoint, this.name);
        const exitCode = await Terminal.exec(this.server, socket, terminalName, "lxc-destroy", [ "-n", this.name ], LXC_PATH);
        if (exitCode !== 0) {
            throw new Error("Failed to destroy LXC container, please check the terminal output for more information.");
        }
        return exitCode;
    }

    async saveConfig(configContent: string): Promise<void> {
        const configPath = path.join(this.path, "config");

        if (!fs.existsSync(this.path)) {
            throw new ValidationError("LXC container not found");
        }

        await fsAsync.writeFile(configPath, configContent);
        this._config = configContent;
    }

    async joinExecTerminal(socket: HomelabSocket, shell: string = "/bin/bash"): Promise<void> {
        const terminalName = getLxcExecTerminalName(socket.endpoint, this.name, 0);
        let terminal = Terminal.getTerminal(terminalName);

        if (!terminal) {
            terminal = new InteractiveTerminal(this.server, terminalName, "lxc-attach", [ "-n", this.name, "--", shell ], LXC_PATH);
            terminal.rows = TERMINAL_ROWS;
            log.debug("joinLxcExecTerminal", "Terminal created");
        }

        terminal.join(socket);
        terminal.start();
    }

    async updateStatus(): Promise<void> {
        const statusList = await LxcContainer.getStatusList();
        const status = statusList.get(this.name);

        if (status !== undefined) {
            this._status = status;
        } else {
            this._status = UNKNOWN;
        }
    }
}
