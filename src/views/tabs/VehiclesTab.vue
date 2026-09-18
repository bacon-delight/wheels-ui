<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

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
            {{ data?.assigned_vehicle_count ?? 0 }} assigned · billing at {{ data?.fleet_size ?? 0 }}
            <span v-if="data?.fleet_size_source === 'override'" class="muted">(manual override)</span>
          </p>
        </div>
        <button v-if="eng.isProvider" class="primary" @click="picking ? (picking = false) : openPicker()">
          {{ picking ? 'Cancel' : '＋ Assign vehicles' }}
        </button>
      </div>

      <div v-if="byDuty.length" class="row bands">
        <span v-for="[band, n] in byDuty" :key="band" class="pill role">{{ pretty(band) }} · {{ n }}</span>
      </div>
      <p v-if="err" class="err">{{ err }}</p>
    </div>

    <div v-if="picking" class="card pad">
      <h2>Available to lease</h2>
      <p class="muted small" style="margin: -8px 0 12px">Only Wheels-owned units in stock can be leased out. Customer-owned units are added from the Vehicles page.</p>
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
      <button v-if="pool.length" class="primary" style="margin-top: 12px" :disabled="!chosen.size || busy === 'assign'" @click="assign">
        {{ busy === 'assign' ? 'Assigning…' : `Assign ${chosen.size} vehicle${chosen.size === 1 ? '' : 's'}` }}
      </button>
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
  </div>
</template>

<style scoped>
.pad { padding: 20px; }
.bands { gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.vtab { width: 100%; border-collapse: collapse; font-size: 13px; }
.vtab th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 6px 10px 8px 0; border-bottom: 1px solid var(--line); }
.vtab td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
.pill.role { background: #e9eef6; color: var(--muted); }
.err { color: var(--risk); margin: 10px 0 0; }
</style>
