<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import Dialog from '../../components/Dialog.vue'
import { api } from '../../services/api'
import { useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eid = route.params.eid
const eng = useEngagementStore()

const data = ref(null)
const pool = ref([])
const loading = ref(true)
const err = ref('')
const busy = ref('')
const picking = ref(false)
const chosen = ref(new Set())

const vehicles = computed(() => data.value?.vehicles || [])
const pretty = (v) => (v || '').replace(/_/g, ' ').toLowerCase()

/**
 * The billed fleet size lives here rather than on Terms.
 *
 * It is a count of vehicles, and this is the page that holds the vehicles — so the number, the
 * inventory it follows, and the button that hands it back to the inventory are all in one
 * place. What it costs is on Billing, which is the one page that states money.
 */
const fleetInput = ref(100)
const savingFleet = ref(false)
const fleetLocked = computed(() =>
  ['BILLING_SETUP', 'PENDING_BILLING_AUDIT', 'CHANGES_REQUESTED_AUDIT', 'ACTIVE'].includes(
    eng.status,
  ),
)
const canSetFleet = computed(() => eng.isProvider && !fleetLocked.value)
async function saveFleet() {
  savingFleet.value = true
  try {
    await api.patch(`/engagements/${eid}/billing`, {
      fleet_size: Math.max(1, Number(fleetInput.value) || 1),
    })
    await Promise.all([load(), eng.load(eid)])
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  savingFleet.value = false
}
// Clearing the override hands the number back to the vehicle inventory.
async function useInventoryCount() {
  savingFleet.value = true
  try {
    await api.patch(`/engagements/${eid}/billing`, { fleet_size: null })
    await Promise.all([load(), eng.load(eid)])
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  savingFleet.value = false
}
watch(
  () => eng.data?.engagement?.fleet_size,
  (fs) => {
    if (fs != null) fleetInput.value = fs
  },
  { immediate: true },
)

// Grouped so a 40-vehicle engagement reads as a fleet mix, not a wall of rows.
const byDuty = computed(() => {
  const out = {}
  for (const v of vehicles.value) out[v.duty_band] = (out[v.duty_band] || 0) + 1
  return Object.entries(out).sort((a, b) => b[1] - a[1])
})

async function load() {
  loading.value = true
  try {
    data.value = (await api.get(`/engagements/${eid}/vehicles`)).data
    err.value = ''
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}

async function openPicker() {
  picking.value = true
  try {
    pool.value = (await api.get('/vehicles', { params: { status: 'IN_STOCK' } })).data.vehicles
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
}

function toggle(id) {
  const next = new Set(chosen.value)
  next.has(id) ? next.delete(id) : next.add(id)
  chosen.value = next
}

async function assign() {
  busy.value = 'assign'
  try {
    await api.post('/vehicles:bulk-assign', {
      vehicle_ids: [...chosen.value],
      engagement_id: eid,
    })
    chosen.value = new Set()
    picking.value = false
    await Promise.all([load(), eng.load(eid)])
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

async function release(id) {
  busy.value = id
  try {
    await api.post(`/vehicles/${id}:release`)
    await Promise.all([load(), eng.load(eid)])
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

onMounted(load)
</script>

<template>
  <div class="stack">
    <div class="card pad">
      <div class="spread">
        <div>
          <h2 style="margin: 0">Vehicles on this engagement</h2>
          <p class="muted small" style="margin: 6px 0 0">
            {{ data?.assigned_vehicle_count ?? 0 }} assigned from the inventory.
          </p>
        </div>
        <button v-if="eng.isProvider" class="primary nowrap" @click="openPicker">＋ Assign vehicles</button>
      </div>

      <div v-if="byDuty.length" class="row bands">
        <span v-for="[band, n] in byDuty" :key="band" class="pill role">{{ pretty(band) }} <b>{{ n }}</b></span>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
    </div>

    <!-- The billed fleet size: what recurring dues are multiplied by. Follows the inventory
         unless somebody overrides it, and locks the moment billing is generated. -->
    <div v-if="eng.isProvider" class="card pad">
      <div class="spread" style="align-items: flex-start">
        <div>
          <h2 style="margin: 0">Billed fleet size</h2>
          <p class="muted small" style="margin: 6px 0 0; max-width: 480px">
            The vehicle count recurring dues are charged against. It follows the
            {{ data?.assigned_vehicle_count ?? 0 }} assigned above unless you override it, and
            locks once billing has been generated.
          </p>
        </div>
        <label v-if="canSetFleet" class="fleetset">
          <span class="label">Vehicles {{ savingFleet ? '· saving…' : '' }}</span>
          <input type="number" min="1" v-model.number="fleetInput" @change="saveFleet" />
        </label>
        <div v-else class="fleetset">
          <span class="label">Vehicles</span>
          <div class="fleetval">{{ data?.fleet_size ?? 0 }}</div>
        </div>
      </div>
      <div class="row" style="margin-top: 10px; gap: 8px">
        <span class="badge" :class="eng.fleetSizeSource === 'override' ? 'warn' : 'ok'">
          <span class="dot" />{{ eng.fleetSizeSource === 'override' ? 'Manual override' : 'From inventory' }}
        </span>
        <span v-if="fleetLocked" class="badge"><span class="dot" />Locked — billing is set up</span>
        <button
          v-if="canSetFleet && eng.fleetSizeSource === 'override'"
          class="ghost sm"
          :disabled="savingFleet"
          @click="useInventoryCount"
        >Use inventory count</button>
        <router-link class="btn-link" :to="`/engagements/${eid}/billing`">What it bills →</router-link>
      </div>
    </div>


    <div class="card pad">
      <p v-if="loading" class="muted">Loading…</p>
      <table v-else-if="vehicles.length" class="vtab">
        <thead><tr><th>Unit</th><th>Vehicle</th><th>Type</th><th>Ownership</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="v in vehicles" :key="v.vehicle_id">
            <td><strong>{{ v.unit_number || v.vin || v.vehicle_id.slice(0, 6) }}</strong></td>
            <td>{{ [v.year, v.make, v.model].filter(Boolean).join(' ') || '—' }}</td>
            <td class="muted">{{ pretty(v.body_class) }}<span class="small"> · {{ pretty(v.duty_band) }}</span></td>
            <td><span class="pill role">{{ v.ownership === 'CUSTOMER_OWNED' ? 'Customer' : 'Wheels' }}</span></td>
            <td><span class="badge info"><span class="dot" />{{ pretty(v.status) }}</span></td>
            <td><button v-if="eng.isProvider" class="ghost sm" :disabled="busy === v.vehicle_id" @click="release(v.vehicle_id)">Release</button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No vehicles assigned yet. The billed fleet size follows this list unless it is overridden.</p>
    </div>

    <Dialog
      :open="picking"
      title="Assign vehicles"
      subtitle="Only Wheels-owned units in stock can be leased out. Customer-owned units are added from the Vehicles page."
      wide
      @close="picking = false"
    >
      <table v-if="pool.length" class="vtab">
        <thead><tr><th style="width: 28px"></th><th>Unit</th><th>Vehicle</th><th>Type</th><th>Power</th></tr></thead>
        <tbody>
          <tr v-for="v in pool" :key="v.vehicle_id">
            <td><input type="checkbox" :checked="chosen.has(v.vehicle_id)" @change="toggle(v.vehicle_id)" /></td>
            <td><strong>{{ v.unit_number || v.vin || v.vehicle_id.slice(0, 6) }}</strong></td>
            <td>{{ [v.year, v.make, v.model].filter(Boolean).join(' ') || '—' }}</td>
            <td class="muted">{{ pretty(v.body_class) }}</td>
            <td class="muted">{{ v.powertrain }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">Nothing in stock. Add vehicles from the Vehicles page first.</p>
      <template #footer>
        <span class="muted small">{{ chosen.size }} of {{ pool.length }} selected</span>
        <span class="sp" />
        <button class="ghost" @click="picking = false">Cancel</button>
        <button class="primary" :disabled="!chosen.size || busy === 'assign'" @click="assign">
          {{ busy === 'assign' ? 'Assigning…' : `Assign ${chosen.size} vehicle${chosen.size === 1 ? '' : 's'}` }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.pad { padding: 20px; }
.bands { gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.nowrap { white-space: nowrap; }
.fleetset { display: flex; flex-direction: column; gap: 6px; width: 130px; }
.fleetset input { text-align: right; }
.fleetval { font-family: var(--serif); font-size: 22px; font-weight: 600; padding: 4px 0; text-align: right; }
.vtab { width: 100%; border-collapse: collapse; font-size: 13px; }
.vtab th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 6px 10px 8px 0; border-bottom: 1px solid var(--line); }
.vtab td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
.pill.role {
  display: inline-flex; align-items: baseline; gap: 6px;
  background: var(--accent-weak); color: var(--accent-ink);
  font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  padding: 4px 10px; border-radius: 999px;
}
.pill.role b { font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0; }
.err { color: var(--risk); margin: 10px 0 0; }
</style>
