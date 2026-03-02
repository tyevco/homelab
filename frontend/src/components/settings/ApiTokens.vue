<template>
    <div class="my-4">
        <!-- Create Token -->
        <h5 class="my-4 settings-subheading">{{ $t("createApiToken") }}</h5>
        <form class="mb-3" @submit.prevent="createToken">
            <div class="mb-3">
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

            <div>
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
        <div v-else class="token-list">
            <div v-for="token in tokenList" :key="token.id" class="token-item mb-3">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold">{{ token.name }}</span>
                        <br />
                        <code>{{ token.tokenPrefix }}...</code>
                        <span class="text-muted ms-2">{{ formatDate(token.createdAt) }}</span>
                    </div>
                    <button class="btn btn-outline-danger btn-sm" @click="confirmRevoke(token)">
                        {{ $t("revokeApiToken") }}
                    </button>
                </div>
            </div>
        </div>

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
            if (navigator.clipboard) {
                navigator.clipboard.writeText(this.createdToken);
            } else {
                document.execCommand("copy");
            }
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

<style scoped>
.token-item {
    padding: 10px 15px;
    border: 1px solid rgba(0, 0, 0, 0.125);
    border-radius: 6px;
}

.dark-theme .token-item {
    border-color: #1d2634;
}
</style>
