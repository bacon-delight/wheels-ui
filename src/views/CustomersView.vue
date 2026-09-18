<script setup>
import { computed, onMounted, ref } from 'vue'

import Dialog from '../components/Dialog.vue'
import Dropdown from '../components/Dropdown.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const customers = ref([])
const loading = ref(true)
const err = ref('')
const q = ref('')
const filterIndustry = ref('')
const showNew = ref(false)
const creating = ref(false)
const form = ref({ legal_name: '', industry: '', city: '', primary_contact_email: '' })

const usd = (n) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const daysTo = (iso) => (iso ? Math.round((new Date(iso) - new Date()) / 86400000) : null)

const stats = computed(() => {
  const all = customers.value
  return {
    total: all.length,
    active: all.filter((c) => c.active_engagements > 0).length,
    engagements: all.reduce((n, c) => n + (c.engagement_count || 0), 0),
    fleet: all.reduce((n, c) => n + (c.fleet_size || 0), 0),
    monthly: all.reduce((n, c) => n + (c.monthly_recurring || 0), 0),
  }
})

// Industry is the natural "type" for a customer, and it is what tells you where the book is
// concentrated. Only the largest few get their own card; the rest fold into Other.
const industryCards = computed(() => {
  const groups = {}
  for (const c of customers.value) {
    const key = c.industry || 'Unspecified'
    const g = (groups[key] ||= { key, count: 0, monthly: 0, fleet: 0 })
    g.count += 1
    g.monthly += c.monthly_recurring || 0
    g.fleet += c.fleet_size || 0
  }
  const sorted = Object.values(groups).sort((a, b) => b.monthly - a.monthly || b.count - a.count)
  const top = sorted.slice(0, 4)
  const rest = sorted.slice(4)
  if (rest.length) {
    top.push({
      key: 'Other',
      count: rest.reduce((n, g) => n + g.count, 0),
      monthly: rest.reduce((n, g) => n + g.monthly, 0),
      fleet: rest.reduce((n, g) => n + g.fleet, 0),
      rollup: rest.map((g) => g.key),
    })
  }
  const total = stats.value.monthly
  return top.map((g) => ({ ...g, share: total ? Math.round((100 * g.monthly) / total) : 0 }))
})

const industryOptions = computed(() => [
  { value: '', label: 'All industries' },
  ...[...new Set(customers.value.map((c) => c.industry).filter(Boolean))]
    .sort()
    .map((v) => ({ value: v, label: v })),
])

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return customers.value.filter((c) => {
    if (filterIndustry.value && c.industry !== filterIndustry.value) return false
    if (!needle) return true
    return [c.legal_name, c.display_name, c.industry, c.city].some((v) =>
      (v || '').toLowerCase().includes(needle),
    )
  })
})

function pickIndustry(card) {
  // The Other card is a rollup of several industries, so it cannot filter to one value.
  if (card.rollup) return
  filterIndustry.value = filterIndustry.value === card.key ? '' : card.key
}

async function load() {
  loading.value = true
  try {
    customers.value = (await api.get('/customers')).data.customers
    err.value = ''
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}

async function create() {
  creating.value = true
  try {
    await api.post('/customers', { ...form.value })
    form.value = { legal_name: '', industry: '', city: '', primary_contact_email: '' }
    showNew.value = false
    await load()
    err.value = ''
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
        <h1>Customers</h1>
        <p class="muted" style="margin: 4px 0 0">Each customer holds every engagement they have signed with Wheels.</p>
      </div>
      <button v-if="auth.isProvider" class="primary nowrap" @click="showNew = true">＋ New customer</button>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-else>
      <div class="grid tiles">
        <div class="stattile"><div class="label">Customers</div><div class="val">{{ stats.total }}</div></div>
        <div class="stattile"><div class="label">With active work</div><div class="val">{{ stats.active }}</div></div>
        <div class="stattile"><div class="label">Engagements</div><div class="val">{{ stats.engagements }}</div></div>
        <div class="stattile"><div class="label">Vehicles billed</div><div class="val">{{ stats.fleet.toLocaleString() }}</div></div>
        <div class="stattile"><div class="label">Monthly recurring</div><div class="val">{{ usd(stats.monthly) }}</div></div>
      </div>

      <!-- Where the book is concentrated by industry; clicking one filters the table. -->
      <div class="grid inds">
        <button
          v-for="c in industryCards"
          :key="c.key"
          class="card scard"
          :class="{ on: filterIndustry === c.key, rollup: !!c.rollup }"
          type="button"
          :title="c.rollup ? c.rollup.join(', ') : ''"
          @click="pickIndustry(c)"
        >
          <div class="spread">
            <span class="label">{{ c.key }}</span>
            <span class="muted small">{{ c.share }}%</span>
          </div>
          <div class="val">{{ usd(c.monthly) }}<span class="per">/mo</span></div>
          <div class="track"><div class="fill" :style="{ width: c.share + '%' }" /></div>
          <div class="muted small">{{ c.count }} customer{{ c.count === 1 ? '' : 's' }} · {{ c.fleet.toLocaleString() }} vehicles</div>
        </button>
      </div>

      <div class="card">
        <div class="row filters">
          <input v-model="q" placeholder="Search customers…" class="search" />
          <div class="fw"><Dropdown v-model="filterIndustry" :options="industryOptions" placeholder="All industries" /></div>
          <span class="muted small" style="margin-left: auto">{{ shown.length }} of {{ customers.length }}</span>
        </div>
        <div class="twrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th><th>Industry</th><th>Location</th>
                <th class="r">Engagements</th><th class="r">Vehicles</th><th class="r">Monthly</th>
                <th>Next expiry</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in shown" :key="c.customer_id">
                <td><router-link :to="`/customers/${c.customer_id}`" class="ename">{{ c.legal_name }}</router-link></td>
                <td class="muted">{{ c.industry || '—' }}</td>
                <td class="muted">{{ [c.city, c.country].filter(Boolean).join(', ') || '—' }}</td>
                <td class="r mono">
                  {{ c.engagement_count }}
                  <span v-if="c.active_engagements !== c.engagement_count" class="muted">({{ c.active_engagements }} active)</span>
                </td>
                <td class="r mono">{{ (c.fleet_size || 0).toLocaleString() }}</td>
                <td class="r mono">{{ c.monthly_recurring ? usd(c.monthly_recurring) : '—' }}</td>
                <td>
                  <template v-if="c.next_contract_end">
                    {{ shortDate(c.next_contract_end) }}
                    <span class="badge" :class="daysTo(c.next_contract_end) < 0 ? 'risk' : daysTo(c.next_contract_end) <= 90 ? 'warn' : 'ok'">
                      <span class="dot" />{{ daysTo(c.next_contract_end) < 0 ? 'expired' : daysTo(c.next_contract_end) + 'd' }}
                    </span>
                  </template>
                  <span v-else class="muted">—</span>
                </td>
                <td><span class="badge" :class="c.status === 'ACTIVE' ? 'ok' : 'warn'"><span class="dot" />{{ c.status }}</span></td>
              </tr>
              <tr v-if="!shown.length">
                <td colspan="8" class="muted" style="padding: 18px">
                  {{ customers.length ? 'No customers match these filters.' : 'No customers yet.' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <Dialog
      :open="showNew"
      title="New customer"
      subtitle="A customer holds every engagement they sign with Wheels, so create them once and add engagements underneath."
      @close="showNew = false"
    >
      <div class="grid two">
        <label class="fld"><span class="label">Legal name</span><input v-model="form.legal_name" placeholder="Apex Field Services LLC" /></label>
        <label class="fld"><span class="label">Industry</span><input v-model="form.industry" placeholder="Field services" /></label>
        <label class="fld"><span class="label">City</span><input v-model="form.city" placeholder="Austin" /></label>
        <label class="fld"><span class="label">Billing contact</span><input v-model="form.primary_contact_email" placeholder="ap@apex.com" /></label>
      </div>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="showNew = false">Cancel</button>
        <button class="primary" :disabled="creating || !form.legal_name.trim()" @click="create">
          {{ creating ? 'Creating…' : 'Create customer' }}
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
.two { grid-template-columns: 1fr 1fr; }

.tiles { grid-template-columns: repeat(5, 1fr); }
.inds { grid-template-columns: repeat(5, 1fr); }
.scard {
  padding: 16px 18px; text-align: left; cursor: pointer; border: 1px solid var(--line);
  background: var(--panel); display: flex; flex-direction: column; gap: 8px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.scard:hover { border-color: var(--line-strong); }
.scard.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
/* The rollup card summarises several industries, so it is not a filter. */
.scard.rollup { cursor: default; }
.scard .val { font-family: var(--serif); font-size: 24px; font-weight: 600; line-height: 1; }
.per { font-family: var(--sans); font-size: 13px; color: var(--muted); margin-left: 3px; font-weight: 400; }
.track { height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; background: #1d5cb0; min-width: 2px; }

.filters { gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.search { width: 260px; }
.fw { width: 210px; }
.twrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 11px 20px; border-top: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
.ename { font-weight: 600; color: var(--ink); }
.ename:hover { color: var(--accent-ink); }
@media (max-width: 1200px) { .inds { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 1000px) { .tiles { grid-template-columns: repeat(3, 1fr); } .two { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .tiles, .inds { grid-template-columns: repeat(2, 1fr); } .search { width: 100%; } }
</style>
