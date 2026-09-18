<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../services/api'

const route = useRoute()

const BODY_CLASSES = [
  'SEDAN', 'SUV', 'MINIVAN', 'CARGO_VAN', 'PICKUP', 'BOX_TRUCK', 'STAKE_FLATBED',
  'SERVICE_BODY', 'STEP_VAN', 'TRACTOR', 'VOCATIONAL_TRUCK', 'TRAILER',
  'SPECIALTY_UPFIT', 'FORKLIFT',
]
const DUTY_BANDS = ['LIGHT_DUTY', 'MEDIUM_DUTY', 'HEAVY_DUTY', 'EQUIPMENT']
const STATUSES = ['ON_ORDER', 'IN_STOCK', 'ASSIGNED', 'IN_MAINTENANCE', 'RETIRED']
const POWERTRAINS = ['ICE', 'HYBRID', 'PHEV', 'BEV']
const LEASE_STRUCTURES = ['TRAC_OPEN_END', 'CLOSED_END', 'FMV', 'CAPITAL']

const vehicles = ref([])
const summary = ref(null)
const engagements = ref([])
const customers = ref([])
const loading = ref(true)
const err = ref('')
const filters = ref({ status: '', duty_band: '', ownership: '', customer_id: route.query.customer_id || '' })
const selected = ref(new Set())
const assignTo = ref('')
const busy = ref('')
const showNew = ref(false)
const form = ref({
  unit_number: '', vin: '', year: null, make: '', model: '',
  body_class: 'SEDAN', powertrain: 'ICE', ownership: 'WHEELS_OWNED',
  customer_id: '', lease_structure: '', lease_term_months: null,
})

const pretty = (v) => (v || '').replace(/_/g, ' ').toLowerCase()
const selectedCount = computed(() => selected.value.size)
const assignable = computed(() => vehicles.value.filter((v) => !v.engagement_id))

function toggle(id) {
  const next = new Set(selected.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selected.value = next
}

async function load() {
  loading.value = true
  try {
    const params = Object.fromEntries(Object.entries(filters.value).filter(([, v]) => v))
    const [v, s] = await Promise.all([
      api.get('/vehicles', { params }),
      api.get('/vehicles/summary'),
    ])
    vehicles.value = v.data.vehicles
    summary.value = s.data
    err.value = ''
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}

async function loadPickers() {
  try {
    const [e, c] = await Promise.all([api.get('/engagements'), api.get('/customers')])
    engagements.value = e.data.engagements
    customers.value = c.data.customers
  } catch {
    /* pickers are optional */
  }
}

async function create() {
  busy.value = 'create'
  try {
    const body = Object.fromEntries(
      Object.entries(form.value).filter(([, v]) => v !== '' && v !== null),
    )
    await api.post('/vehicles', body)
    showNew.value = false
    form.value = { ...form.value, unit_number: '', vin: '', make: '', model: '', year: null }
    await load()
    err.value = ''
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

async function assignSelected() {
  if (!assignTo.value || !selectedCount.value) return
  busy.value = 'assign'
  try {
    const r = await api.post('/vehicles:bulk-assign', {
      vehicle_ids: [...selected.value],
      engagement_id: assignTo.value,
    })
    err.value = r.data.failed?.length ? `${r.data.failed.length} could not be assigned` : ''
    selected.value = new Set()
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

async function release(id) {
  busy.value = id
  try {
    await api.post(`/vehicles/${id}:release`)
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

const engName = (id) => engagements.value.find((e) => e.engagement_id === id)?.name || id?.slice(0, 6)

onMounted(async () => {
  await Promise.all([load(), loadPickers()])
})
watch(filters, load, { deep: true })
</script>

<template>
  <div class="page">
    <div class="spread head">
      <div>
        <h1>Vehicles</h1>
        <p class="muted" style="margin: 4px 0 0">The fleet Wheels owns, plus customer-owned units we service.</p>
      </div>
      <button class="primary" @click="showNew = !showNew">{{ showNew ? 'Cancel' : '＋ Add vehicle' }}</button>
    </div>

    <div v-if="summary" class="grid tiles">
      <div class="stattile"><div class="label">Total units</div><div class="val">{{ summary.total }}</div></div>
      <div class="stattile"><div class="label">Available to lease</div><div class="val">{{ summary.available_to_lease }}</div></div>
      <div class="stattile"><div class="label">Assigned</div><div class="val">{{ summary.assigned }}</div></div>
      <div class="stattile"><div class="label">Customer-owned</div><div class="val">{{ summary.customer_owned }}</div></div>
    </div>

    <div v-if="showNew" class="card pad">
      <h2>Add vehicle</h2>
      <div class="grid four">
        <label class="fld"><span class="label">Unit number</span><input v-model="form.unit_number" placeholder="A-104" /></label>
        <label class="fld"><span class="label">VIN</span><input v-model="form.vin" placeholder="1FT…" /></label>
        <label class="fld"><span class="label">Year</span><input v-model.number="form.year" type="number" placeholder="2025" /></label>
        <label class="fld"><span class="label">Make</span><input v-model="form.make" placeholder="Ford" /></label>
        <label class="fld"><span class="label">Model</span><input v-model="form.model" placeholder="F-150" /></label>
        <label class="fld"><span class="label">Body class</span><select v-model="form.body_class"><option v-for="b in BODY_CLASSES" :key="b" :value="b">{{ pretty(b) }}</option></select></label>
        <label class="fld"><span class="label">Powertrain</span><select v-model="form.powertrain"><option v-for="p in POWERTRAINS" :key="p" :value="p">{{ p }}</option></select></label>
        <label class="fld"><span class="label">Ownership</span><select v-model="form.ownership"><option value="WHEELS_OWNED">Wheels owned</option><option value="CUSTOMER_OWNED">Customer owned (service only)</option></select></label>
        <template v-if="form.ownership === 'CUSTOMER_OWNED'">
          <label class="fld"><span class="label">Customer</span><select v-model="form.customer_id"><option value="">Select…</option><option v-for="c in customers" :key="c.customer_id" :value="c.customer_id">{{ c.legal_name }}</option></select></label>
        </template>
        <template v-else>
          <label class="fld"><span class="label">Lease structure</span><select v-model="form.lease_structure"><option value="">—</option><option v-for="l in LEASE_STRUCTURES" :key="l" :value="l">{{ pretty(l) }}</option></select></label>
          <label class="fld"><span class="label">Term (months)</span><input v-model.number="form.lease_term_months" type="number" min="24" max="120" placeholder="36" /></label>
        </template>
      </div>
      <button class="primary" style="margin-top: 14px" :disabled="busy === 'create'" @click="create">
        {{ busy === 'create' ? 'Adding…' : 'Add vehicle' }}
      </button>
    </div>

    <div class="card pad">
      <div class="row filters">
        <label class="fld"><span class="label">Status</span><select v-model="filters.status"><option value="">All</option><option v-for="s in STATUSES" :key="s" :value="s">{{ pretty(s) }}</option></select></label>
        <label class="fld"><span class="label">Type</span><select v-model="filters.duty_band"><option value="">All</option><option v-for="d in DUTY_BANDS" :key="d" :value="d">{{ pretty(d) }}</option></select></label>
        <label class="fld"><span class="label">Ownership</span><select v-model="filters.ownership"><option value="">All</option><option value="WHEELS_OWNED">Wheels owned</option><option value="CUSTOMER_OWNED">Customer owned</option></select></label>
        <label class="fld"><span class="label">Customer</span><select v-model="filters.customer_id"><option value="">All</option><option v-for="c in customers" :key="c.customer_id" :value="c.customer_id">{{ c.legal_name }}</option></select></label>
      </div>

      <div v-if="selectedCount" class="row assignbar">
        <strong>{{ selectedCount }} selected</strong>
        <select v-model="assignTo" style="max-width: 260px">
          <option value="">Assign to engagement…</option>
          <option v-for="e in engagements" :key="e.engagement_id" :value="e.engagement_id">{{ e.name }} — {{ e.client_name }}</option>
        </select>
        <button class="primary sm" :disabled="!assignTo || busy === 'assign'" @click="assignSelected">
          {{ busy === 'assign' ? 'Assigning…' : 'Assign' }}
        </button>
        <button class="ghost sm" @click="selected = new Set()">Clear</button>
      </div>

      <p v-if="err" class="err">{{ err }}</p>
      <p v-if="loading" class="muted">Loading…</p>

      <table v-else-if="vehicles.length" class="vtab">
        <thead>
          <tr>
            <th style="width: 28px"></th>
            <th>Unit</th><th>Vehicle</th><th>Type</th><th>Power</th>
            <th>Ownership</th><th>Status</th><th>Engagement</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in vehicles" :key="v.vehicle_id">
            <td><input type="checkbox" :disabled="!!v.engagement_id" :checked="selected.has(v.vehicle_id)" @change="toggle(v.vehicle_id)" /></td>
            <td><strong>{{ v.unit_number || v.vin || v.vehicle_id.slice(0, 6) }}</strong></td>
            <td>{{ [v.year, v.make, v.model].filter(Boolean).join(' ') || '—' }}</td>
            <td class="muted">{{ pretty(v.body_class) }}<span class="muted small"> · {{ pretty(v.duty_band) }}</span></td>
            <td class="muted">{{ v.powertrain }}</td>
            <td><span class="pill role">{{ v.ownership === 'CUSTOMER_OWNED' ? 'Customer' : 'Wheels' }}</span></td>
            <td><span class="badge" :class="v.status === 'IN_STOCK' ? 'ok' : v.status === 'ASSIGNED' ? 'info' : 'warn'"><span class="dot" />{{ pretty(v.status) }}</span></td>
            <td>
              <router-link v-if="v.engagement_id" :to="`/engagements/${v.engagement_id}`">{{ engName(v.engagement_id) }}</router-link>
              <span v-else class="muted">—</span>
            </td>
            <td>
              <button v-if="v.engagement_id" class="ghost sm" :disabled="busy === v.vehicle_id" @click="release(v.vehicle_id)">Release</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="muted">No vehicles match these filters.</p>
      <p v-if="!loading && vehicles.length" class="muted small" style="margin-top: 10px">
        {{ vehicles.length }} shown · {{ assignable.length }} unassigned
      </p>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1140px; padding: 28px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
.head h1 { margin: 0; }
.pad { padding: 20px; }
.tiles { grid-template-columns: repeat(4, 1fr); }
.four { grid-template-columns: repeat(4, 1fr); }
.fld { display: flex; flex-direction: column; gap: 6px; }
.filters { gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.filters .fld { min-width: 150px; }
.assignbar { gap: 10px; padding: 10px 12px; background: var(--accent-weak); border-radius: var(--radius-sm); margin-bottom: 12px; flex-wrap: wrap; }
.vtab { width: 100%; border-collapse: collapse; font-size: 13px; }
.vtab th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 6px 10px 8px 0; border-bottom: 1px solid var(--line); }
.vtab td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
.pill.role { background: #e9eef6; color: var(--muted); }
.err { color: var(--risk); }
@media (max-width: 900px) { .tiles, .four { grid-template-columns: repeat(2, 1fr); } }
</style>
