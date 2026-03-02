<template>
    <div class="my-4">
        <!-- Create Token -->
        <h5 class="my-4 settings-subheading">{{ $t("createApiToken") }}</h5>
        <form class="mb-4" @submit.prevent="createToken">
            <div class="d-flex align-items-end gap-2">
                <div class="flex-grow-1">
                    <label for="api-token-name" class="form-label">
                        {{ $t("apiTokenName") }}
                    </label>
                    <input
                        id="api-token-name"
                        v-model="newTokenName"
                        type="text"
                        class="form-control"
                        required
                        maxlength="255"
                    />
                </div>
                <button class="btn btn-primary" type="submit" :disabled="creating">
                    {{ $t("createApiToken") }}
                </button>
            </div>
        </form>

        <!-- Show newly created token -->
        <div v-if="createdToken" class="alert alert-success">
            <p class="mb-2"><strong>{{ $t("apiTokenCopyMsg") }}</strong></p>
            <div class="input-group">
                <input
                    ref="tokenInput"
                    type="text"
                    class="form-control font-monospace"
                    :value="createdToken"
                    readonly
                />
                <button class="btn btn-outline-secondary" type="button" @click="copyToken">
                    <font-awesome-icon icon="copy" />
                </button>
            </div>
        </div>

        <!-- Token List -->
        <h5 class="my-4 settings-subheading">{{ $t("apiTokens") }}</h5>
        <div v-if="tokenList.length === 0" class="text-muted">
            {{ $t("noApiTokens") }}
        </div>
        <table v-else class="table">
            <thead>
                <tr>
                    <th>{{ $t("apiTokenName") }}</th>
                    <th>{{ $t("apiTokenPrefix") }}</th>
                    <th>{{ $t("apiTokenCreatedAt") }}</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="token in tokenList" :key="token.id">
                    <td>{{ token.name }}</td>
                    <td><code>{{ token.tokenPrefix }}...</code></td>
                    <td>{{ formatDate(token.createdAt) }}</td>
                    <td>
                        <button class="btn btn-outline-danger btn-sm" @click="confirmRevoke(token)">
                            {{ $t("revokeApiToken") }}
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>

        <Confirm
            ref="confirmRevokeDialog"
            btn-style="btn-danger"
            :yes-text="$t('revokeApiToken')"
            :no-text="$t('cancel')"
            @yes="revokeToken"
        >
            <p>{{ $t("revokeApiTokenMsg") }}</p>
        </Confirm>
    </div>
</template>

<script>
import Confirm from "../../components/Confirm.vue";
import dayjs from "dayjs";

export default {
    components: {
        Confirm,
    },

    data() {
        return {
            newTokenName: "",
            creating: false,
            createdToken: null,
            tokenList: [],
            tokenToRevoke: null,
        };
    },

    mounted() {
        this.loadTokenList();
    },

    methods: {
        loadTokenList() {
            this.$root.getSocket().emit("getApiTokenList", (res) => {
                if (res.ok) {
                    this.tokenList = res.data;
                }
            });
        },

        createToken() {
            this.creating = true;
            this.createdToken = null;
            this.$root.getSocket().emit("addApiToken", { name: this.newTokenName }, (res) => {
                this.creating = false;
                if (res.ok) {
                    this.createdToken = res.token;
                    this.newTokenName = "";
                    this.loadTokenList();
                }
                this.$root.toastRes(res);
            });
        },

        copyToken() {
            this.$refs.tokenInput.select();
            navigator.clipboard.writeText(this.createdToken);
        },

        confirmRevoke(token) {
            this.tokenToRevoke = token;
            this.$refs.confirmRevokeDialog.show();
        },

        revokeToken() {
            if (!this.tokenToRevoke) {
                return;
            }
            this.$root.getSocket().emit("removeApiToken", this.tokenToRevoke.id, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadTokenList();
                }
                this.tokenToRevoke = null;
            });
        },

        formatDate(date) {
            return dayjs(date).format("YYYY-MM-DD HH:mm");
        },
    },
};
</script>
