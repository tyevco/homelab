import { AgentSocketHandler } from "../agent-socket-handler";
import { DockgeServer } from "../dockge-server";
import { callbackError, callbackResult, checkLogin, DockgeSocket, ValidationError } from "../util-server";
import { LxcContainer } from "../lxc-container";
import { AgentSocket } from "../../common/agent-socket";

export class LxcSocketHandler extends AgentSocketHandler {
    create(socket: DockgeSocket, server: DockgeServer, agentSocket: AgentSocket) {

        agentSocket.on("getLxcContainer", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);

                callbackResult({
                    ok: true,
                    container: container.toJSON(socket.endpoint),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("requestLxcContainerList", async (callback) => {
            try {
                checkLogin(socket);
                server.sendLxcContainerList();
                callbackResult({
                    ok: true,
                    msg: "Updated",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("startLxcContainer", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);
                await container.start(socket);
                callbackResult({
                    ok: true,
                    msg: "Started",
                    msgi18n: true,
                }, callback);
                server.sendLxcContainerList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("stopLxcContainer", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);
                await container.stop(socket);
                callbackResult({
                    ok: true,
                    msg: "Stopped",
                    msgi18n: true,
                }, callback);
                server.sendLxcContainerList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("restartLxcContainer", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);
                await container.restart(socket);
                callbackResult({
                    ok: true,
                    msg: "Restarted",
                    msgi18n: true,
                }, callback);
                server.sendLxcContainerList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("freezeLxcContainer", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);
                await container.freeze(socket);
                callbackResult({
                    ok: true,
                    msg: "Frozen",
                    msgi18n: true,
                }, callback);
                server.sendLxcContainerList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("unfreezeLxcContainer", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);
                await container.unfreeze(socket);
                callbackResult({
                    ok: true,
                    msg: "Unfrozen",
                    msgi18n: true,
                }, callback);
                server.sendLxcContainerList();
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("deleteLxcContainer", async (name: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);

                try {
                    await container.delete(socket);
                } catch (e) {
                    server.sendLxcContainerList();
                    throw e;
                }

                server.sendLxcContainerList();
                callbackResult({
                    ok: true,
                    msg: "Destroyed",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("saveLxcConfig", async (name: unknown, config: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }
                if (typeof config !== "string") {
                    throw new ValidationError("Config must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);
                await container.saveConfig(config);
                callbackResult({
                    ok: true,
                    msg: "Saved",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("createLxcContainer", async (name: unknown, dist: unknown, release: unknown, arch: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }
                if (typeof dist !== "string") {
                    throw new ValidationError("Distribution must be a string");
                }
                if (typeof release !== "string") {
                    throw new ValidationError("Release must be a string");
                }
                if (typeof arch !== "string") {
                    throw new ValidationError("Architecture must be a string");
                }

                await LxcContainer.create(server, socket, name, dist, release, arch);
                server.sendLxcContainerList();
                callbackResult({
                    ok: true,
                    msg: "Created",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("getLxcDistributions", async (callback) => {
            try {
                checkLogin(socket);
                const distributions = await LxcContainer.getAvailableDistributions();
                callbackResult({
                    ok: true,
                    distributions,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        agentSocket.on("lxcExecTerminal", async (name: unknown, shell: unknown, callback) => {
            try {
                checkLogin(socket);

                if (typeof name !== "string") {
                    throw new ValidationError("Container name must be a string");
                }
                if (typeof shell !== "string") {
                    throw new ValidationError("Shell must be a string");
                }

                const container = await LxcContainer.getContainer(server, name);
                await container.joinExecTerminal(socket, shell);
                callbackResult({
                    ok: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
