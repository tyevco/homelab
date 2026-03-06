import * as pty from "@homebridge/node-pty-prebuilt-multiarch";

export const TERMINAL_COLS = 105;
export const TERMINAL_ROWS = 10;
export const PROGRESS_TERMINAL_ROWS = 8;

const BUFFER_SIZE = 100;

/** Minimal socket interface — only what the terminal needs to emit events */
export interface SocketLike {
    emit(event: string, ...args: unknown[]): void;
}

export class AgentTerminal {
    static readonly terminalMap = new Map<string, AgentTerminal>();

    protected _ptyProcess?: pty.IPty;
    protected readonly buffer: string[] = [];
    protected _rows = TERMINAL_ROWS;
    protected _cols = TERMINAL_COLS;
    protected exitCallback?: (exitCode: number) => void;

    /** Exposed so joinExecTerminal can update the socket on reconnect */
    socket: SocketLike;

    constructor(
        socket: SocketLike,
        readonly name: string,
        protected readonly file: string,
        protected readonly args: string[],
        protected readonly cwd: string,
    ) {
        this.socket = socket;
        AgentTerminal.terminalMap.set(name, this);
    }

    get rows() {
        return this._rows;
    }

    set rows(v: number) {
        this._rows = v;
        try {
            this._ptyProcess?.resize(this._cols, v);
        } catch { /* ignore */ }
    }

    get cols() {
        return this._cols;
    }

    set cols(v: number) {
        this._cols = v;
        try {
            this._ptyProcess?.resize(v, this._rows);
        } catch { /* ignore */ }
    }

    start() {
        if (this._ptyProcess) {
            return;
        }

        try {
            this._ptyProcess = pty.spawn(this.file, this.args, {
                name: this.name,
                cwd: this.cwd,
                cols: this._cols,
                rows: this._rows,
            });

            this._ptyProcess.onData((data) => {
                if (this.buffer.length >= BUFFER_SIZE) {
                    this.buffer.shift();
                }
                this.buffer.push(data);
                this.socket.emit("agent", "terminalWrite", this.name, data);
            });

            this._ptyProcess.onExit(({ exitCode }) => {
                this.socket.emit("agent", "terminalExit", this.name, exitCode);
                AgentTerminal.terminalMap.delete(this.name);
                this.exitCallback?.(exitCode);
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            const exitCode = Number(msg.split(" ").pop()) || 1;
            this.socket.emit("agent", "terminalExit", this.name, exitCode);
            AgentTerminal.terminalMap.delete(this.name);
            this.exitCallback?.(exitCode);
        }
    }

    write(input: string) {
        this._ptyProcess?.write(input);
    }

    close() {
        this._ptyProcess?.write("\x03");
    }

    getBuffer(): string {
        return this.buffer.join("");
    }

    onExit(cb: (exitCode: number) => void) {
        this.exitCallback = cb;
    }

    static getTerminal(name: string): AgentTerminal | undefined {
        return AgentTerminal.terminalMap.get(name);
    }

    /**
     * Spawn a non-interactive terminal for a command, resolve with its exit code.
     * Output is streamed back to the main server via `socket`.
     */
    static exec(
        socket: SocketLike,
        terminalName: string,
        file: string,
        args: string[],
        cwd: string,
    ): Promise<number> {
        return new Promise((resolve, reject) => {
            if (AgentTerminal.terminalMap.has(terminalName)) {
                reject(new Error("Another operation is already running, please try again later."));
                return;
            }
            const terminal = new AgentTerminal(socket, terminalName, file, args, cwd);
            terminal.rows = PROGRESS_TERMINAL_ROWS;
            terminal.onExit(resolve);
            terminal.start();
        });
    }

    /** Remove all terminals — called on socket disconnect to free PTYs */
    static closeAll() {
        for (const terminal of AgentTerminal.terminalMap.values()) {
            terminal.close();
        }
        AgentTerminal.terminalMap.clear();
    }
}
