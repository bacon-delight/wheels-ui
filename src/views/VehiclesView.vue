<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import Dialog from '../components/Dialog.vue'
import Dropdown from '../components/Dropdown.vue'
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
const page = ref(1)
const perPage = ref(20)
const perPageOptions = [15, 20, 50, 100].map((n) => ({ value: n, label: `${n} per page` }))
const busy = ref('')
const showNew = ref(false)
const form = ref({
  unit_number: '', vin: '', year: null, make: '', model: '',
  body_class: 'SEDAN', powertrain: 'ICE', ownership: 'WHEELS_OWNED',
  customer_id: '', lease_structure: '', lease_term_months: null, odometer: null,
})

const pretty = (v) => (v || '').replace(/_/g, ' ').toLowerCase()
const opts = (values, allLabel) => [
  ...(allLabel ? [{ value: '', label: allLabel }] : []),
  ...values.map((v) => ({ value: v, label: pretty(v) })),
]
const statusOptions = opts(STATUSES, 'All statuses')
const dutyOptions = opts(DUTY_BANDS, 'All types')
const ownershipFilterOptions = [
  { value: '', label: 'All ownership' },
  { value: 'WHEELS_OWNED', label: 'Wheels owned' },
  { value: 'CUSTOMER_OWNED', label: 'Customer owned' },
]
const ownershipOptions = ownershipFilterOptions.slice(1)
const bodyOptions = opts(BODY_CLASSES)
const powertrainOptions = POWERTRAINS.map((v) => ({ value: v, label: v }))
const leaseOptions = [{ value: '', label: 'Not specified' }, ...opts(LEASE_STRUCTURES)]
const customerOptions = computed(() => customers.value.map((c) => ({ value: c.customer_id, label: c.legal_name })))
const customerFilterOptions = computed(() => [{ value: '', label: 'All customers' }, ...customerOptions.value])
const assignable = computed(() => vehicles.value.filter((v) => !v.engagement_id))

// The filtered set is already in memory, so paging is a slice; the fleet is in the hundreds,
// not the millions, and a cursor round-trip per page would be slower than this.
const pageCount = computed(() => Math.max(1, Math.ceil(vehicles.value.length / perPage.value)))
const paged = computed(() => {
  const start = (page.value - 1) * perPage.value
  return vehicles.value.slice(start, start + perPage.value)
})
const rangeFrom = computed(() => (vehicles.value.length ? (page.value - 1) * perPage.value + 1 : 0))
const rangeTo = computed(() => Math.min(page.value * perPage.value, vehicles.value.length))
// A window around the current page, so a 25-page list does not render 25 buttons.
const pageWindow = computed(() => {
  const total = pageCount.value
  const span = 5
  let start = Math.max(1, page.value - Math.floor(span / 2))
  const end = Math.min(total, start + span - 1)
  start = Math.max(1, end - span + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
})
function goTo(n) {
  page.value = Math.min(pageCount.value, Math.max(1, n))
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
watch(filters, () => { page.value = 1; load() }, { deep: true })
watch(perPage, () => { page.value = 1 })
</script>

<template>
  <div class="page">
    <div class="spread head">
      <div>
        <h1>Vehicles</h1>
        <p class="muted" style="margin: 4px 0 0">The fleet Wheels owns, plus customer-owned units we service.</p>
      </div>
      <button class="primary nowrap" @click="showNew = true">＋ Add vehicle</button>
    </div>

    <div v-if="summary" class="grid tiles">
      <div class="stattile"><div class="label">Total units</div><div class="val">{{ summary.total }}</div></div>
      <div class="stattile">
        <div class="label">Utilisation</div>
        <div class="val">{{ summary.utilisation }}%</div>
        <div class="muted small">{{ summary.assigned }} of {{ summary.wheels_owned }} leasable on hire</div>
      </div>
      <div class="stattile"><div class="label">Available to lease</div><div class="val">{{ summary.available_to_lease }}</div></div>
      <div class="stattile">
        <div class="label">Electrified</div>
        <div class="val">{{ summary.electrified_share }}%</div>
        <div class="muted small">hybrid, plug-in or battery</div>
      </div>
      <div class="stattile"><div class="label">Customer-owned</div><div class="val">{{ summary.customer_owned }}</div></div>
    </div>

    <!-- Composition. Bar length carries the share, so one hue per breakdown; status is the
         exception because those are states and use the reserved ramp. -->
    <div v-if="summary" class="grid comp">
      <div class="card pad">
        <h2>By status</h2>
        <div class="stack8">
          <div v-for="b in summary.status_breakdown" :key="b.key" class="brk">
            <div class="brktop"><span class="bkey">{{ pretty(b.key) }}</span><span class="mono">{{ b.count }} <span class="muted">{{ b.share }}%</span></span></div>
            <div class="track"><div class="fill" :class="'st_' + b.key" :style="{ width: b.share + '%' }" /></div>
          </div>
        </div>
      </div>
      <div class="card pad">
        <h2>By type</h2>
        <div class="stack8">
          <div v-for="b in summary.duty_breakdown" :key="b.key" class="brk">
            <div class="brktop"><span class="bkey">{{ pretty(b.key) }}</span><span class="mono">{{ b.count }} <span class="muted">{{ b.share }}%</span></span></div>
            <div class="track"><div class="fill" :style="{ width: b.share + '%' }" /></div>
          </div>
        </div>
      </div>
      <div class="card pad">
        <h2>By powertrain</h2>
        <div class="stack8">
          <div v-for="b in summary.powertrain_breakdown" :key="b.key" class="brk">
            <div class="brktop"><span class="bkey">{{ b.key }}</span><span class="mono">{{ b.count }} <span class="muted">{{ b.share }}%</span></span></div>
            <div class="track"><div class="fill" :class="'pw_' + b.key" :style="{ width: b.share + '%' }" /></div>
          </div>
        </div>
      </div>
    </div>

    <div class="card pad">
      <div class="row filters">
        <label class="fld"><span class="label">Status</span><Dropdown v-model="filters.status" :options="statusOptions" placeholder="All statuses" /></label>
        <label class="fld"><span class="label">Type</span><Dropdown v-model="filters.duty_band" :options="dutyOptions" placeholder="All types" /></label>
        <label class="fld"><span class="label">Ownership</span><Dropdown v-model="filters.ownership" :options="ownershipFilterOptions" placeholder="All ownership" /></label>
        <label class="fld"><span class="label">Customer</span><Dropdown v-model="filters.customer_id" :options="customerFilterOptions" placeholder="All customers" /></label>
      </div>

      <p v-if="err" class="err">{{ err }}</p>
      <p v-if="loading" class="muted">Loading…</p>

      <table v-else-if="vehicles.length" class="vtab">
        <thead>
          <tr>
            <th>Unit</th><th>Vehicle</th><th>Type</th><th>Power</th>
            <th>Ownership</th><th>Status</th><th>Engagement</th><th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="v in paged" :key="v.vehicle_id">
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

      <div v-if="!loading && vehicles.length" class="pager">
        <span class="muted small">
          {{ rangeFrom }}–{{ rangeTo }} of {{ vehicles.length }} · {{ assignable.length }} unassigned
        </span>
        <div class="pgbtns">
          <button class="pg" :disabled="page === 1" aria-label="Previous page" @click="goTo(page - 1)">‹</button>
          <button v-if="pageWindow[0] > 1" class="pg" @click="goTo(1)">1</button>
          <span v-if="pageWindow[0] > 2" class="muted">…</span>
          <button v-for="n in pageWindow" :key="n" class="pg" :class="{ on: n === page }" @click="goTo(n)">{{ n }}</button>
          <span v-if="pageWindow[pageWindow.length - 1] < pageCount - 1" class="muted">…</span>
          <button v-if="pageWindow[pageWindow.length - 1] < pageCount" class="pg" @click="goTo(pageCount)">{{ pageCount }}</button>
          <button class="pg" :disabled="page === pageCount" aria-label="Next page" @click="goTo(page + 1)">›</button>
        </div>
        <div style="width: 150px"><Dropdown v-model="perPage" :options="perPageOptions" /></div>
      </div>
    </div>

    <Dialog
      :open="showNew"
      title="Add vehicle"
      subtitle="Wheels-owned units enter stock and can be leased out. Customer-owned units are third-party: we service them, we never lease them."
      wide
      @close="showNew = false"
    >
      <div class="grid three">
        <label class="fld"><span class="label">Unit number</span><input v-model="form.unit_number" placeholder="WH-0104" /></label>
        <label class="fld"><span class="label">VIN</span><input v-model="form.vin" placeholder="1FTFW1E5XPKD12345" /></label>
        <label class="fld"><span class="label">Year</span><input v-model.number="form.year" type="number" placeholder="2025" /></label>
        <label class="fld"><span class="label">Make</span><input v-model="form.make" placeholder="Ford" /></label>
        <label class="fld"><span class="label">Model</span><input v-model="form.model" placeholder="F-150" /></label>
        <label class="fld"><span class="label">Body class</span><Dropdown v-model="form.body_class" :options="bodyOptions" /></label>
        <label class="fld"><span class="label">Powertrain</span><Dropdown v-model="form.powertrain" :options="powertrainOptions" /></label>
        <label class="fld"><span class="label">Odometer</span><input v-model.number="form.odometer" type="number" placeholder="12000" /></label>
        <label class="fld"><span class="label">Ownership</span><Dropdown v-model="form.ownership" :options="ownershipOptions" /></label>
      </div>
      <div class="grid two" style="margin-top: 14px">
        <template v-if="form.ownership === 'CUSTOMER_OWNED'">
          <label class="fld"><span class="label">Customer</span><Dropdown v-model="form.customer_id" :options="customerOptions" placeholder="Select customer…" /></label>
        </template>
        <template v-else>
          <label class="fld"><span class="label">Lease structure</span><Dropdown v-model="form.lease_structure" :options="leaseOptions" placeholder="Not specified" /></label>
          <label class="fld"><span class="label">Term (months)</span><input v-model.number="form.lease_term_months" type="number" min="24" max="120" placeholder="36" /></label>
        </template>
      </div>
      <p v-if="err && showNew" class="err" style="margin-top: 14px">{{ err }}</p>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="showNew = false">Cancel</button>
        <button class="primary" :disabled="busy === 'create'" @click="create">
          {{ busy === 'create' ? 'Adding…' : 'Add vehicle' }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1680px; margin: 0 auto; padding: 28px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
.head h1 { margin: 0; }
.pad { padding: 20px; }
.tiles { grid-template-columns: repeat(5, 1fr); }
.three { grid-template-columns: repeat(3, 1fr); }
.two { grid-template-columns: repeat(2, 1fr); }
.nowrap { white-space: nowrap; }
.fld { display: flex; flex-direction: column; gap: 6px; }
.filters { gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.filters .fld { min-width: 150px; }
.comp { grid-template-columns: repeat(3, 1fr); }
.stack8 { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
.brk { display: flex; flex-direction: column; gap: 5px; }
.brktop { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; align-items: baseline; }
/* Uppercase needs tracking and a smaller size to stay quiet next to the figures. */
.bkey { font-size: 11.5px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-soft); }
.mono { font-variant-numeric: tabular-nums; }
.track { height: 8px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; background: #1d5cb0; min-width: 2px; }
.fill.st_IN_STOCK { background: #14a06a; }
.fill.st_ASSIGNED { background: #1d5cb0; }
.fill.st_ON_ORDER { background: #4a86d4; }
.fill.st_IN_MAINTENANCE { background: #d97a29; }
.fill.st_RETIRED { background: #8a8294; }
.fill.pw_ICE { background: #6b7994; }
.fill.pw_HYBRID { background: #4a86d4; }
.fill.pw_PHEV { background: #1d5cb0; }
.fill.pw_BEV { background: #14a06a; }
.vtab { width: 100%; border-collapse: collapse; font-size: 13px; }
.vtab th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 6px 10px 8px 0; border-bottom: 1px solid var(--line); }
.vtab td { padding: 9px 10px 9px 0; border-bottom: 1px solid var(--line); vertical-align: middle; }
.pill.role { background: #e9eef6; color: var(--muted); }
.err { color: var(--risk); }
.pager { display: flex; align-items: center; justify-content: space-between; gap: 14px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.pgbtns { display: flex; align-items: center; gap: 4px; }
.pg {
  min-width: 32px; height: 32px; padding: 0 9px; border: 1px solid var(--line-strong);
  border-radius: 8px; background: var(--panel); font-size: 13px; color: var(--ink-soft);
  font-variant-numeric: tabular-nums; cursor: pointer;
}
.pg:hover:not(:disabled) { border-color: var(--muted); color: var(--ink); }
.pg.on { background: var(--accent); border-color: var(--accent); color: #fff; font-weight: 600; }
.pg:disabled { opacity: 0.4; cursor: not-allowed; }
@media (max-width: 1000px) { .comp { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .tiles, .three, .two { grid-template-columns: repeat(2, 1fr); } }
</style>
