import { AgentSocketHandler } from "../agent-socket-handler";
import { HomelabServer } from "../homelab-server";
import { callbackError, callbackResult, checkLogin, HomelabSocket, ValidationError } from "../util-server";
import { AgentSocket } from "../../common/agent-socket";
import { promises as fs } from "fs";
import childProcessAsync from "promisify-child-process";

const DISKS_INI = "/var/local/emhttp/disks.ini";

function parseIni(content: string): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    let section = "";
    for (const line of content.split("\n")) {
        const sectionMatch = line.match(/^\[(.+)\]$/);
        if (sectionMatch) {
            section = sectionMatch[1].trim();
            result[section] = {};
        } else if (section) {
            const eq = line.indexOf("=");
            if (eq !== -1) {
                result[section][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
            }
        }
    }
    return result;
}
const SHARES_INI = "/var/local/emhttp/shares.ini";
const VMS_INI = "/var/local/emhttp/vms.ini";
const MDCMD = "/proc/mdcmd";

export class UnraidSocketHandler extends AgentSocketHandler {
    create(socket: HomelabSocket, _server: HomelabServer, agentSocket: AgentSocket) {

        agentSocket.on("getUnraidDisks", async (callback) => {
            try {
                checkLogin(socket);
                const content = await fs.readFile(DISKS_INI, "utf8");
                const parsed = parseIni(content);
                const data = Object.values(parsed).filter((v) => typeof v === "object");
                callbackResult({ ok: true,
                    data }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getUnraidArrayStatus", async (callback) => {
            try {
                checkLogin(socket);
                const content = await fs.readFile(MDCMD, "utf8");
                const data: Record<string, string> = {};
                for (const line of content.split("\n")) {
                    const eq = line.indexOf("=");
                    if (eq !== -1) {
                        data[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
                    }
                }
                callbackResult({ ok: true,
                    data }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getUnraidShares", async (callback) => {
            try {
                checkLogin(socket);
                const content = await fs.readFile(SHARES_INI, "utf8");
                const parsed = parseIni(content);
                const data = Object.values(parsed).filter((v) => typeof v === "object");
                callbackResult({ ok: true,
                    data }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getUnraidVms", async (callback) => {
            try {
                checkLogin(socket);
                const content = await fs.readFile(VMS_INI, "utf8");
                const parsed = parseIni(content);
                const data = Object.values(parsed).filter((v) => typeof v === "object");
                callbackResult({ ok: true,
                    data }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("startUnraidVm", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("VM name must be a string");
                }

                await childProcessAsync.spawn("virsh", [ "start", name ], { encoding: "utf8" });
                callbackResult({ ok: true,
                    msg: "Started",
                    msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("stopUnraidVm", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("VM name must be a string");
                }

                await childProcessAsync.spawn("virsh", [ "shutdown", name ], { encoding: "utf8" });
                callbackResult({ ok: true,
                    msg: "Stopped",
                    msgi18n: true }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
