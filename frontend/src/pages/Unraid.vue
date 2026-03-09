<template>
    <div>
        <h1 class="mb-3">Unraid</h1>

        <!-- Agent selector -->
        <div v-if="unraidAgents.length > 1" class="mb-3">
            <label for="unraid-agent-select" class="form-label">Agent</label>
            <select id="unraid-agent-select" v-model="selectedEndpoint" class="form-select" style="width: auto; display: inline-block;">
                <option v-for="a in unraidAgents" :key="a.endpoint" :value="a.endpoint">
                    {{ a.endpoint || "Local" }}
                </option>
            </select>
        </div>

        <div v-if="unraidAgents.length === 0" class="alert alert-warning">
            No Unraid agent connected. Install and start <code>homelab-unraid-agent</code> on your Unraid host.
        </div>

        <div v-else>
            <!-- Tabs -->
            <ul class="nav nav-tabs mb-3">
                <li v-for="tab in tabs" :key="tab" class="nav-item">
                    <a class="nav-link" :class="{ active: activeTab === tab }" href="#" @click.prevent="activeTab = tab">
                        {{ tab }}
                    </a>
                </li>
            </ul>

            <!-- Disks Tab -->
            <div v-if="activeTab === 'Disks'">
                <div v-if="loading.disks" class="text-muted">Loading…</div>
                <table v-else class="table table-hover">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Device</th>
                            <th>Size</th>
                            <th>Temp</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(disk, i) in disks" :key="i">
                            <td>{{ disk.name || disk.Name || "—" }}</td>
                            <td>{{ disk.device || disk.Device || "—" }}</td>
                            <td>{{ disk.size || disk.Size || "—" }}</td>
                            <td>{{ disk.temp || disk.Temp || "—" }}</td>
                            <td>
                                <span :class="diskStatusClass(disk)">
                                    {{ disk.status || disk.Status || disk.diskState || "—" }}
                                </span>
                            </td>
                        </tr>
                        <tr v-if="disks.length === 0">
                            <td colspan="5" class="text-muted text-center">No disks found</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- Array Tab -->
            <div v-if="activeTab === 'Array'">
                <div v-if="loading.array" class="text-muted">Loading…</div>
                <div v-else>
                    <p>
                        <strong>Status:</strong>
                        <span :class="arrayStatus === 'STARTED' ? 'badge bg-success ms-2' : 'badge bg-secondary ms-2'">
                            {{ arrayStatus || "Unknown" }}
                        </span>
                    </p>
                    <div v-if="parityPercent !== null" class="mb-3">
                        <p><strong>Parity check:</strong> {{ parityPercent }}%</p>
                        <div class="progress">
                            <div class="progress-bar" role="progressbar" :style="{ width: parityPercent + '%' }"></div>
                        </div>
                    </div>
                    <p v-if="arrayData.mdNumErrors !== undefined">
                        <strong>Errors:</strong> {{ arrayData.mdNumErrors }}
                    </p>
                    <pre v-if="Object.keys(arrayData).length" class="small text-muted" style="max-height:300px;overflow:auto">{{ JSON.stringify(arrayData, null, 2) }}</pre>
                </div>
            </div>

            <!-- Shares Tab -->
            <div v-if="activeTab === 'Shares'">
                <div v-if="loading.shares" class="text-muted">Loading…</div>
                <table v-else class="table table-hover">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Free</th>
                            <th>Used</th>
                            <th>Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(share, i) in shares" :key="i">
                            <td>{{ share.name || share.Name || "—" }}</td>
                            <td>{{ share.free || share.Free || "—" }}</td>
                            <td>{{ share.used || share.Used || "—" }}</td>
                            <td>
                                <div v-if="sharePercent(share) !== null" class="progress" style="min-width:80px">
                                    <div class="progress-bar" role="progressbar" :style="{ width: sharePercent(share) + '%' }"></div>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="shares.length === 0">
                            <td colspan="4" class="text-muted text-center">No shares found</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- VMs Tab -->
            <div v-if="activeTab === 'VMs'">
                <div v-if="loading.vms" class="text-muted">Loading…</div>
                <table v-else class="table table-hover">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(vm, i) in vms" :key="i">
                            <td>{{ vm.name || vm.Name || "—" }}</td>
                            <td>{{ vm.status || vm.Status || vm.state || "—" }}</td>
                            <td>
                                <button class="btn btn-sm btn-primary me-1" :disabled="vmBusy[i]" @click="startVm(vm, i)">Start</button>
                                <button class="btn btn-sm btn-secondary" :disabled="vmBusy[i]" @click="stopVm(vm, i)">Stop</button>
                            </td>
                        </tr>
                        <tr v-if="vms.length === 0">
                            <td colspan="3" class="text-muted text-center">No VMs found</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

<script>
export default {
    data() {
        return {
            selectedEndpoint: null,
            activeTab: "Disks",
            tabs: [ "Disks", "Array", "Shares", "VMs" ],
            disks: [],
            arrayData: {},
            shares: [],
            vms: [],
            loading: { disks: false,
                array: false,
                shares: false,
                vms: false },
            vmBusy: {},
        };
    },

    computed: {
        unraidAgents() {
            const list = this.$root.agentList ?? {};
            return Object.values(list).filter(
                (a) => a.capabilities && a.capabilities.unraidAvailable
            );
        },

        arrayStatus() {
            return this.arrayData.mdState || this.arrayData.state || null;
        },

        parityPercent() {
            const pos = parseInt(this.arrayData.sbSyncPos ?? this.arrayData.mdResyncPos ?? "", 10);
            const size = parseInt(this.arrayData.sbSyncSize ?? this.arrayData.mdResyncSize ?? "", 10);
            if (!isNaN(pos) && !isNaN(size) && size > 0) {
                return Math.round((pos / size) * 100);
            }
            return null;
        },
    },

    watch: {
        unraidAgents(agents) {
            if (agents.length > 0 && !this.selectedEndpoint) {
                this.selectedEndpoint = agents[0].endpoint;
            }
        },
        selectedEndpoint() {
            this.loadAll();
        },
        activeTab(tab) {
            this.loadTab(tab);
        },
    },

    mounted() {
        if (this.unraidAgents.length > 0) {
            this.selectedEndpoint = this.unraidAgents[0].endpoint;
            this.loadAll();
        }
    },

    methods: {
        endpoint() {
            return this.selectedEndpoint ?? "";
        },

        loadAll() {
            for (const tab of this.tabs) {
                this.loadTab(tab);
            }
        },

        loadTab(tab) {
            if (tab === "Disks") {
                this.loading.disks = true;
                this.$root.emitAgent(this.endpoint(), "getUnraidDisks", (res) => {
                    this.loading.disks = false;
                    if (res.ok) {
                        this.disks = res.data || [];
                    }
                });
            } else if (tab === "Array") {
                this.loading.array = true;
                this.$root.emitAgent(this.endpoint(), "getUnraidArrayStatus", (res) => {
                    this.loading.array = false;
                    if (res.ok) {
                        this.arrayData = res.data || {};
                    }
                });
            } else if (tab === "Shares") {
                this.loading.shares = true;
                this.$root.emitAgent(this.endpoint(), "getUnraidShares", (res) => {
                    this.loading.shares = false;
                    if (res.ok) {
                        this.shares = res.data || [];
                    }
                });
            } else if (tab === "VMs") {
                this.loading.vms = true;
                this.$root.emitAgent(this.endpoint(), "getUnraidVms", (res) => {
                    this.loading.vms = false;
                    if (res.ok) {
                        this.vms = res.data || [];
                        this.vmBusy = {};
                    }
                });
            }
        },

        diskStatusClass(disk) {
            const s = (disk.status || disk.Status || disk.diskState || "").toLowerCase();
            if (s === "ok" || s === "active") {
                return "badge bg-success";
            } else if (s.includes("warn") || s.includes("dsbl")) {
                return "badge bg-warning";
            } else if (s.includes("fail") || s.includes("err")) {
                return "badge bg-danger";
            }
            return "badge bg-secondary";
        },

        sharePercent(share) {
            const free = parseInt(share.free || share.Free || "", 10);
            const used = parseInt(share.used || share.Used || "", 10);
            if (!isNaN(free) && !isNaN(used) && (free + used) > 0) {
                return Math.round((used / (free + used)) * 100);
            }
            return null;
        },

        startVm(vm, i) {
            const name = vm.name || vm.Name;
            if (!name) {
                return;
            }
            this.$set(this.vmBusy, i, true);
            this.$root.emitAgent(this.endpoint(), "startUnraidVm", name, (res) => {
                this.$set(this.vmBusy, i, false);
                this.$root.toastRes(res);
            });
        },

        stopVm(vm, i) {
            const name = vm.name || vm.Name;
            if (!name) {
                return;
            }
            this.$set(this.vmBusy, i, true);
            this.$root.emitAgent(this.endpoint(), "stopUnraidVm", name, (res) => {
                this.$set(this.vmBusy, i, false);
                this.$root.toastRes(res);
            });
        },
    },
};
</script>
