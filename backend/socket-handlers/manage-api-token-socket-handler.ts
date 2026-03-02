import { SocketHandler } from "../socket-handler.js";
import { HomelabServer } from "../homelab-server";
import { log } from "../log";
import { callbackError, callbackResult, checkLogin, HomelabSocket } from "../util-server";
import { R } from "redbean-node";
import { genSecret } from "../../common/util-common";
import { generatePasswordHash } from "../password-hash";
import { ApiToken } from "../models/api_token";

export class ManageApiTokenSocketHandler extends SocketHandler {

    create(socket : HomelabSocket, server : HomelabServer) {
        // addApiToken
        socket.on("addApiToken", async (requestData : unknown, callback : unknown) => {
            try {
                log.debug("manage-api-token", "addApiToken");
                checkLogin(socket);

                if (requestData === null || typeof(requestData) !== "object") {
                    throw new Error("Data must be an object");
                }

                let data = requestData as { name?: string };

                if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
                    throw new Error("Token name is required");
                }

                const rawToken = "hlk_" + genSecret(40);
                const tokenHash = generatePasswordHash(rawToken);
                const tokenPrefix = rawToken.substring(0, 10);

                let bean = R.dispense("api_token") as ApiToken;
                bean.user_id = socket.userID;
                bean.name = data.name.trim();
                bean.token_hash = tokenHash;
                bean.token_prefix = tokenPrefix;
                bean.active = 1;
                await R.store(bean);

                callbackResult({
                    ok: true,
                    msg: "apiTokenCreated",
                    msgi18n: true,
                    token: rawToken,
                    data: bean.toJSON(),
                }, callback);

            } catch (e) {
                callbackError(e, callback);
            }
        });

        // removeApiToken
        socket.on("removeApiToken", async (tokenId : unknown, callback : unknown) => {
            try {
                log.debug("manage-api-token", "removeApiToken");
                checkLogin(socket);

                if (typeof tokenId !== "number") {
                    throw new Error("Token ID must be a number");
                }

                let bean = await R.findOne("api_token", " id = ? AND user_id = ? ", [ tokenId, socket.userID ]);
                if (!bean) {
                    throw new Error("Token not found");
                }

                await R.trash(bean);

                callbackResult({
                    ok: true,
                    msg: "apiTokenRevoked",
                    msgi18n: true,
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });

        // getApiTokenList
        socket.on("getApiTokenList", async (callback : unknown) => {
            try {
                log.debug("manage-api-token", "getApiTokenList");
                checkLogin(socket);

                let list = await R.find("api_token", " user_id = ? ORDER BY created_at DESC ", [ socket.userID ]) as ApiToken[];

                callbackResult({
                    ok: true,
                    data: list.map((t) => t.toJSON()),
                }, callback);
            } catch (e) {
                callbackError(e, callback);
            }
        });
    }
}
