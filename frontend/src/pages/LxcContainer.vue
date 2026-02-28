<template>
    <transition name="slide-fade" appear>
        <div>
            <h1 v-if="isAdd" class="mb-3">{{ $t("createLxcContainer") }}</h1>
            <h1 v-else class="mb-3">
                <Uptime :stack="globalContainer" :pill="true" /> {{ container.name }}
                <span v-if="$root.agentCount > 1" class="agent-name">
                    ({{ endpointDisplay }})
                </span>
            </h1>

            <div class="mb-3">
                <div class="btn-group me-2" role="group">
                    <!-- Create mode -->
                    <button v-if="isAdd" class="btn btn-primary" :disabled="processing" @click="createContainer">
                        <font-awesome-icon icon="plus" class="me-1" />
                        {{ $t("createLxcContainer") }}
                    </button>

                    <!-- View mode actions -->
                    <button v-if="!isAdd && !isEditMode && !active" class="btn btn-primary" :disabled="processing" @click="startContainer">
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("startLxcContainer") }}
                    </button>

                    <button v-if="!isAdd && !isEditMode && active" class="btn btn-normal" :disabled="processing" @click="restartContainer">
                        <font-awesome-icon icon="rotate" class="me-1" />
                        {{ $t("restartLxcContainer") }}
                    </button>

                    <button v-if="!isAdd && !isEditMode && active" class="btn btn-normal" :disabled="processing" @click="stopContainer">
                        <font-awesome-icon icon="stop" class="me-1" />
                        {{ $t("stopLxcContainer") }}
                    </button>

                    <button v-if="!isAdd && !isEditMode && active && !isFrozen" class="btn btn-normal" :disabled="processing" @click="freezeContainer">
                        <font-awesome-icon icon="pause" class="me-1" />
                        {{ $t("freezeLxcContainer") }}
                    </button>

                    <button v-if="!isAdd && !isEditMode && isFrozen" class="btn btn-normal" :disabled="processing" @click="unfreezeContainer">
                        <font-awesome-icon icon="play" class="me-1" />
                        {{ $t("unfreezeLxcContainer") }}
                    </button>
                </div>

                <button v-if="!isAdd && !isEditMode" class="btn btn-normal" :disabled="processing" @click="enableEditMode">
                    <font-awesome-icon icon="pen" class="me-1" />
                    {{ $t("Edit") }}
                </button>

                <button v-if="!isAdd && isEditMode" class="btn btn-primary" :disabled="processing" @click="saveConfig">
                    <font-awesome-icon icon="save" class="me-1" />
                    {{ $t("Save") }}
                </button>

                <button v-if="!isAdd && isEditMode" class="btn btn-normal" :disabled="processing" @click="discardChanges">
                    {{ $t("discardStack") }}
                </button>

                <button v-if="!isAdd && !isEditMode" class="btn btn-danger" :disabled="processing" @click="showDeleteDialog = !showDeleteDialog">
                    <font-awesome-icon icon="trash" class="me-1" />
                    {{ $t("deleteLxcContainer") }}
                </button>
            </div>

            <!-- Progress Terminal -->
            <transition name="slide-fade" appear>
                <Terminal
                    v-show="showProgressTerminal"
                    ref="progressTerminal"
                    class="mb-3 terminal"
                    :name="terminalName"
                    :endpoint="endpoint"
                    :rows="progressTerminalRows"
                    @has-data="showProgressTerminal = true; submitted = true;"
                ></Terminal>
            </transition>

            <div class="row">
                <div class="col-lg-6">
                    <!-- Create Form -->
                    <div v-if="isAdd">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <div class="mb-3">
                                <label for="lxc-name" class="form-label">{{ $t("lxcContainerName") }}</label>
                                <input id="lxc-name" v-model="container.name" type="text" class="form-control" required @blur="containerNameToLowercase">
                                <div class="form-text">{{ $t("Lowercase only") }}</div>
                            </div>

                            <div class="mb-3">
                                <label for="lxc-dist" class="form-label">{{ $t("lxcDistribution") }}</label>
                                <select id="lxc-dist" v-model="selectedDist" class="form-select" @change="onDistChange">
                                    <option v-for="dist in uniqueDists" :key="dist" :value="dist">{{ dist }}</option>
                                </select>
                            </div>

                            <div class="mb-3">
                                <label for="lxc-release" class="form-label">{{ $t("lxcRelease") }}</label>
                                <select id="lxc-release" v-model="selectedRelease" class="form-select" @change="onReleaseChange">
                                    <option v-for="release in availableReleases" :key="release" :value="release">{{ release }}</option>
                                </select>
                            </div>

                            <div class="mb-3">
                                <label for="lxc-arch" class="form-label">{{ $t("lxcArchitecture") }}</label>
                                <select id="lxc-arch" v-model="selectedArch" class="form-select">
                                    <option v-for="arch in availableArchitectures" :key="arch" :value="arch">{{ arch }}</option>
                                </select>
                            </div>

                            <div class="mb-3">
                                <label for="lxc-endpoint" class="form-label">{{ $t("dockgeAgent") }}</label>
                                <select id="lxc-endpoint" v-model="container.endpoint" class="form-select">
                                    <option v-for="(agent, ep) in $root.agentList" :key="ep" :value="ep" :disabled="$root.agentStatusList[ep] != 'online'">
                                        ({{ $root.agentStatusList[ep] }}) {{ (ep) ? ep : $t("currentEndpoint") }}
                                    </option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <!-- Container Info (View Mode) -->
                    <div v-if="!isAdd && !isEditMode">
                        <h4 class="mb-3">{{ $t("general") }}</h4>
                        <div class="shadow-box big-padding mb-3">
                            <div class="row mb-2">
                                <div class="col-4 fw-bold">IP</div>
                                <div class="col-8">{{ container.ip || "-" }}</div>
                            </div>
                            <div class="row mb-2">
                                <div class="col-4 fw-bold">PID</div>
                                <div class="col-8">{{ container.pid || "-" }}</div>
                            </div>
                            <div class="row mb-2">
                                <div class="col-4 fw-bold">Memory</div>
                                <div class="col-8">{{ container.memory || "-" }}</div>
                            </div>
                            <div class="row mb-2">
                                <div class="col-4 fw-bold">Autostart</div>
                                <div class="col-8">{{ container.autostart ? "Yes" : "No" }}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Interactive Terminal -->
                    <div v-if="!isAdd && active">
                        <h4 class="mb-3">{{ $t("terminal") }}</h4>
                        <div class="mb-2">
                            <button class="btn btn-normal btn-sm" :disabled="processing" @click="openExecTerminal('/bin/bash')">bash</button>
                            <button class="btn btn-normal btn-sm ms-1" :disabled="processing" @click="openExecTerminal('/bin/sh')">sh</button>
                        </div>
                        <Terminal
                            v-if="showExecTerminal"
                            ref="execTerminal"
                            class="mb-3 terminal interactive-terminal"
                            :name="execTerminalName"
                            :endpoint="endpoint"
                            :rows="terminalRows"
                            :interactive="true"
                        ></Terminal>
                    </div>
                </div>

                <div class="col-lg-6">
                    <!-- Config Editor -->
                    <h4 class="mb-3">{{ $t("lxcConfig") }}</h4>
                    <div class="shadow-box mb-3 editor-box" :class="{'edit-mode' : isEditMode}">
                        <code-mirror
                            ref="editor"
                            v-model="container.config"
                            :extensions="extensions"
                            minimal
                            wrap="true"
                            dark="true"
                            tab="true"
                            :disabled="!isEditMode"
                        />
                    </div>
                </div>
            </div>

            <!-- Delete Dialog -->
            <BModal v-model="showDeleteDialog" :cancelTitle="$t('cancel')" :okTitle="$t('deleteLxcContainer')" okVariant="danger" @ok="deleteContainer">
                {{ $t("deleteLxcContainerMsg") }}
            </BModal>
        </div>
    </transition>
</template>

<script>
import CodeMirror from "vue-codemirror6";
import { python } from "@codemirror/lang-python";
import { dracula as editorTheme } from "thememirror";
import { lineNumbers, EditorView } from "@codemirror/view";
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import {
    getLxcTerminalName,
    getLxcExecTerminalName,
    PROGRESS_TERMINAL_ROWS,
    RUNNING,
    FROZEN,
    TERMINAL_ROWS,
} from "../../../common/util-common";
import { BModal } from "bootstrap-vue-next";
import { ref } from "vue";

export default {
    components: {
        FontAwesomeIcon,
        CodeMirror,
        BModal,
    },
    beforeRouteUpdate(to, from, next) {
        next();
    },
    beforeRouteLeave(to, from, next) {
        if (this.isEditMode) {
            if (confirm("You are currently editing. Are you sure you want to leave?")) {
                next();
            } else {
                next(false);
            }
        } else {
            next();
        }
    },
    setup() {
        const editorFocus = ref(false);

        const focusEffectHandler = (state, focusing) => {
            editorFocus.value = focusing;
            return null;
        };

        const extensions = [
            editorTheme,
            python(),
            lineNumbers(),
            EditorView.focusChangeEffect.of(focusEffectHandler)
        ];

        return { extensions, editorFocus };
    },
    data() {
        return {
            processing: true,
            showProgressTerminal: false,
            progressTerminalRows: PROGRESS_TERMINAL_ROWS,
            terminalRows: TERMINAL_ROWS,
            container: {
                name: "",
                endpoint: "",
                config: "",
                ip: "",
                pid: 0,
                memory: "",
                autostart: false,
                status: 0,
            },
            isEditMode: false,
            submitted: false,
            showDeleteDialog: false,
            showExecTerminal: false,
            distributions: [],
            selectedDist: "",
            selectedRelease: "",
            selectedArch: "amd64",
            originalConfig: "",
        };
    },
    computed: {
        endpointDisplay() {
            return this.$root.endpointDisplayFunction(this.endpoint);
        },

        isAdd() {
            return this.$route.path === "/lxc" && !this.submitted;
        },

        globalContainer() {
            return this.$root.completeLxcContainerList[this.container.name + "_" + this.endpoint];
        },

        status() {
            return this.globalContainer?.status;
        },

        active() {
            return this.status === RUNNING || this.status === FROZEN;
        },

        isFrozen() {
            return this.status === FROZEN;
        },

        endpoint() {
            return this.container.endpoint || this.$route.params.endpoint || "";
        },

        terminalName() {
            if (!this.container.name) {
                return "";
            }
            return getLxcTerminalName(this.endpoint, this.container.name);
        },

        execTerminalName() {
            if (!this.container.name) {
                return "";
            }
            return getLxcExecTerminalName(this.endpoint, this.container.name, 0);
        },

        url() {
            if (this.container.endpoint) {
                return `/lxc/${this.container.name}/${this.container.endpoint}`;
            } else {
                return `/lxc/${this.container.name}`;
            }
        },

        uniqueDists() {
            const dists = new Set(this.distributions.map(d => d.dist));
            return [...dists].sort();
        },

        availableReleases() {
            const releases = new Set(
                this.distributions
                    .filter(d => d.dist === this.selectedDist)
                    .map(d => d.release)
            );
            return [...releases].sort();
        },

        availableArchitectures() {
            const archs = new Set(
                this.distributions
                    .filter(d => d.dist === this.selectedDist && d.release === this.selectedRelease)
                    .map(d => d.arch)
            );
            return [...archs].sort();
        },
    },
    mounted() {
        if (this.isAdd) {
            this.processing = false;
            this.isEditMode = false;
            this.loadDistributions();
        } else {
            this.container.name = this.$route.params.containerName;
            this.loadContainer();
        }
    },
    methods: {
        loadDistributions() {
            this.$root.emitAgent(this.endpoint, "getLxcDistributions", (res) => {
                if (res.ok) {
                    this.distributions = res.distributions;
                    if (this.uniqueDists.length > 0) {
                        this.selectedDist = this.uniqueDists[0];
                        this.onDistChange();
                    }
                }
            });
        },

        onDistChange() {
            if (this.availableReleases.length > 0) {
                this.selectedRelease = this.availableReleases[0];
                this.onReleaseChange();
            }
        },

        onReleaseChange() {
            if (this.availableArchitectures.length > 0) {
                this.selectedArch = this.availableArchitectures.includes("amd64") ? "amd64" : this.availableArchitectures[0];
            }
        },

        loadContainer() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "getLxcContainer", this.container.name, (res) => {
                if (res.ok) {
                    this.container = res.container;
                    this.originalConfig = this.container.config;
                    this.processing = false;
                    this.bindTerminal();
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        bindTerminal() {
            this.$refs.progressTerminal?.bind(this.endpoint, this.terminalName);
        },

        createContainer() {
            if (!this.container.name) {
                this.$root.toastError("Container name is required");
                return;
            }

            this.processing = true;
            this.bindTerminal();

            this.$root.emitAgent(this.container.endpoint, "createLxcContainer", this.container.name, this.selectedDist, this.selectedRelease, this.selectedArch, (res) => {
                this.processing = false;
                this.$root.toastRes(res);

                if (res.ok) {
                    this.$router.push(this.url);
                }
            });
        },

        startContainer() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "startLxcContainer", this.container.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadContainer();
                }
            });
        },

        stopContainer() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "stopLxcContainer", this.container.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadContainer();
                }
            });
        },

        restartContainer() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "restartLxcContainer", this.container.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadContainer();
                }
            });
        },

        freezeContainer() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "freezeLxcContainer", this.container.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        unfreezeContainer() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "unfreezeLxcContainer", this.container.name, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
            });
        },

        deleteContainer() {
            this.$root.emitAgent(this.endpoint, "deleteLxcContainer", this.container.name, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.$router.push("/");
                }
            });
        },

        saveConfig() {
            this.processing = true;
            this.$root.emitAgent(this.endpoint, "saveLxcConfig", this.container.name, this.container.config, (res) => {
                this.processing = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.isEditMode = false;
                    this.originalConfig = this.container.config;
                }
            });
        },

        enableEditMode() {
            this.isEditMode = true;
            this.originalConfig = this.container.config;
        },

        discardChanges() {
            this.container.config = this.originalConfig;
            this.isEditMode = false;
        },

        openExecTerminal(shell) {
            this.showExecTerminal = true;
            this.$root.emitAgent(this.endpoint, "lxcExecTerminal", this.container.name, shell, (res) => {
                if (!res.ok) {
                    this.$root.toastRes(res);
                }
            });
        },

        containerNameToLowercase() {
            this.container.name = this.container?.name?.toLowerCase();
        },
    }
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.terminal {
    height: 200px;
}

.interactive-terminal {
    height: 350px;
}

.editor-box {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
}

.agent-name {
    font-size: 13px;
    color: $dark-font-color3;
}
</style>
