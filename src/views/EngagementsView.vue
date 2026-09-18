<script setup>
import { computed, onMounted, ref } from 'vue'

import Dialog from '../components/Dialog.vue'
import Dropdown from '../components/Dropdown.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { SCOPE_LABELS } from '../stores/engagement'

const auth = useAuthStore()
const engagements = ref([])
const customers = ref([])
const loading = ref(true)
const err = ref('')
const name = ref('')
const customerId = ref('')
const filterCustomer = ref('')
const creating = ref(false)
const showNew = ref(false)

// The flat list stays the cross-customer worklist; the filter narrows it to one customer.
const shown = computed(() =>
  engagements.value.filter(
    (e) =>
      (!filterCustomer.value || e.customer_id === filterCustomer.value) &&
      (!filterScope.value || e.scope === filterScope.value) &&
      (!filterStatus.value || e.status === filterStatus.value),
  ),
)
const filterScope = ref('')
const filterStatus = ref('')

const ACTIVE = 'ACTIVE'
const PIPELINE_DONE = new Set(['ACTIVE'])

// Headline counts, derived from the list rather than a second request.
const stats = computed(() => {
  const all = engagements.value
  const active = all.filter((e) => e.status === ACTIVE)
  const byScope = {}
  for (const e of all) byScope[e.scope] = (byScope[e.scope] || 0) + 1
  return {
    total: all.length,
    active: active.length,
    pipeline: all.filter((e) => !PIPELINE_DONE.has(e.status)).length,
    fleet: active.reduce((n, e) => n + (e.fleet_size || 0), 0),
    monthly: active.reduce((n, e) => n + (e.monthly_recurring || 0), 0),
    byScope,
  }
})
// One card per scope, so "what kind of business is this" is answerable at a glance.
const scopeCards = computed(() =>
  Object.entries(SCOPE_LABELS).map(([key, label]) => {
    const rows = engagements.value.filter((e) => e.scope === key)
    const active = rows.filter((e) => e.status === ACTIVE)
    return {
      key,
      label,
      count: rows.length,
      share: stats.value.total ? Math.round((100 * rows.length) / stats.value.total) : 0,
      fleet: active.reduce((n, e) => n + (e.fleet_size || 0), 0),
      monthly: active.reduce((n, e) => n + (e.monthly_recurring || 0), 0),
    }
  }),
)

const statusOptions = computed(() => [
  { value: '', label: 'All statuses' },
  ...[...new Set(engagements.value.map((e) => e.status))].sort().map((v) => ({
    value: v, label: v.replace(/_/g, ' ').toLowerCase(),
  })),
])
const scopeFilterOptions = [
  { value: '', label: 'All scopes' },
  ...Object.entries(SCOPE_LABELS).map(([value, label]) => ({ value, label })),
]

const usd = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const customerName = (id) => customers.value.find((c) => c.customer_id === id)?.legal_name
const customerOptions = computed(() => customers.value.map((c) => ({ value: c.customer_id, label: c.legal_name })))
const customerFilterOptions = computed(() => [{ value: '', label: 'All customers' }, ...customerOptions.value])

async function load() {
  loading.value = true
  err.value = ''
  try {
    engagements.value = (await api.get('/engagements')).data.engagements
    if (auth.isProvider) customers.value = (await api.get('/customers')).data.customers
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}

async function create() {
  creating.value = true
  err.value = ''
  try {
    await api.post('/engagements', { name: name.value, customer_id: customerId.value })
    name.value = ''
    customerId.value = ''
    showNew.value = false
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  creating.value = false
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="spread head">
      <div>
        <h1>Engagements</h1>
        <p class="muted" style="margin: 4px 0 0">Customer onboarding &amp; billing-term review</p>
      </div>
      <button v-if="auth.isProvider" class="primary nowrap" @click="showNew = true">＋ New engagement</button>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-else>
      <div class="grid tiles">
        <div class="stattile"><div class="label">Engagements</div><div class="val">{{ stats.total }}</div></div>
        <div class="stattile"><div class="label">Active</div><div class="val">{{ stats.active }}</div></div>
        <div class="stattile"><div class="label">In pipeline</div><div class="val">{{ stats.pipeline }}</div></div>
        <div class="stattile"><div class="label">Vehicles billed</div><div class="val">{{ stats.fleet.toLocaleString() }}</div></div>
        <div class="stattile"><div class="label">Monthly recurring</div><div class="val">{{ usd(stats.monthly) }}</div></div>
      </div>

      <!-- One card per scope: what kind of business the book is made of. -->
      <div class="grid scopes">
        <button
          v-for="c in scopeCards"
          :key="c.key"
          class="card scard"
          :class="{ on: filterScope === c.key }"
          type="button"
          @click="filterScope = filterScope === c.key ? '' : c.key"
        >
          <div class="spread">
            <span class="label">{{ c.label }}</span>
            <span class="muted small">{{ c.share }}%</span>
          </div>
          <div class="val">{{ c.count }}</div>
          <div class="track"><div class="fill" :class="'sc_' + c.key" :style="{ width: c.share + '%' }" /></div>
          <div class="muted small">{{ c.fleet.toLocaleString() }} vehicles · {{ usd(c.monthly) }}/mo</div>
        </button>
      </div>

      <div class="card">
        <div class="row filters">
          <div class="fw"><Dropdown v-model="filterCustomer" :options="customerFilterOptions" placeholder="All customers" /></div>
          <div class="fw"><Dropdown v-model="filterScope" :options="scopeFilterOptions" placeholder="All scopes" /></div>
          <div class="fw"><Dropdown v-model="filterStatus" :options="statusOptions" placeholder="All statuses" /></div>
          <span class="muted small" style="margin-left: auto">{{ shown.length }} of {{ engagements.length }}</span>
        </div>
        <div class="twrap">
          <table>
            <thead>
              <tr>
                <th>Engagement</th><th>Customer</th><th>Scope</th><th>Status</th>
                <th class="r">Vehicles</th><th class="r">Monthly</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="e in shown" :key="e.engagement_id">
                <td><router-link :to="`/engagements/${e.engagement_id}`" class="ename">{{ e.name }}</router-link></td>
                <td>
                  <router-link v-if="e.customer_id" :to="`/customers/${e.customer_id}`" class="muted">{{ customerName(e.customer_id) || e.client_name }}</router-link>
                  <span v-else class="muted">{{ e.client_name }}</span>
                </td>
                <td class="muted">{{ SCOPE_LABELS[e.scope] || 'Pending upload' }}</td>
                <td><StatusPill v-if="e.status" :status="e.status" /></td>
                <td class="r mono">{{ (e.fleet_size || 0).toLocaleString() }}</td>
                <td class="r mono">{{ e.monthly_recurring ? usd(e.monthly_recurring) : '—' }}</td>
              </tr>
              <tr v-if="!shown.length">
                <td colspan="6" class="muted" style="padding: 18px">
                  {{ engagements.length ? 'No engagements match these filters.' : 'No engagements yet.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <Dialog
      :open="showNew"
      title="New engagement"
      subtitle="Create it first, then upload the agreements. We read each one to work out whether it is a lease or a service agreement, and which is in force."
      @close="showNew = false"
    >
      <label class="fld">
        <span class="label">Engagement name</span>
        <input v-model="name" placeholder="Spring lease — 40 units" />
      </label>
      <label class="fld" style="margin-top: 14px">
        <span class="label">Customer</span>
        <Dropdown v-model="customerId" :options="customerOptions" placeholder="Select customer…" />
      </label>
      <p class="muted small" style="margin: 14px 0 0">
        No customer yet? <router-link to="/customers">Add one first</router-link>.
      </p>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="showNew = false">Cancel</button>
        <button class="primary" :disabled="!name || !customerId || creating" @click="create">
          {{ creating ? 'Creating…' : 'Create engagement' }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1680px; margin: 0 auto; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
.head { margin-bottom: 4px; align-items: flex-start; }
.head h1 { margin: 0; }
.nowrap { white-space: nowrap; }
.small { font-size: 12px; }
.mono { font-variant-numeric: tabular-nums; }
.r { text-align: right; }
.err { color: var(--risk); }
.fld { display: flex; flex-direction: column; gap: 6px; }

.tiles { grid-template-columns: repeat(5, 1fr); }
.scopes { grid-template-columns: repeat(3, 1fr); }
.scard {
  padding: 16px 18px; text-align: left; cursor: pointer; border: 1px solid var(--line);
  background: var(--panel); display: flex; flex-direction: column; gap: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.scard:hover { border-color: var(--line-strong); }
/* Selected scope doubles as the table filter, so it has to read as a pressed state. */
.scard.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
.scard .val { font-family: var(--serif); font-size: 26px; font-weight: 600; line-height: 1; }
.track { height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; background: #1d5cb0; min-width: 2px; }
.fill.sc_LEASE_ONLY { background: #1d5cb0; }
.fill.sc_SERVICE_ONLY { background: #14a06a; }
.fill.sc_LEASE_AND_SERVICE { background: #4a86d4; }

.filters { gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.fw { width: 210px; }
.twrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 11px 20px; border-top: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
.ename { font-weight: 600; color: var(--ink); }
.ename:hover { color: var(--accent-ink); }
@media (max-width: 1000px) { .tiles { grid-template-columns: repeat(3, 1fr); } .scopes { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
</style>
