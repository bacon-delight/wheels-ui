<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import Dialog from '../components/Dialog.vue'
import StatusPill from '../components/StatusPill.vue'
import { api } from '../services/api'
import { SCOPE_LABELS } from '../stores/engagement'

const route = useRoute()
const data = ref(null)
const loading = ref(true)
const err = ref('')
const showNew = ref(false)
const creating = ref(false)
const form = ref({ name: '' })

const customer = computed(() => data.value?.customer)
const engagements = computed(() => data.value?.engagements || [])
const vehicles = computed(() => data.value?.vehicles || [])
const contacts = computed(() => data.value?.contacts || [])
const totalBilled = computed(() => engagements.value.reduce((n, e) => n + (e.fleet_size || 0), 0))

// Vehicles grouped by duty band, so "how much heavy equipment do they run" is answerable.
const byDuty = computed(() => {
  const out = {}
  for (const v of vehicles.value) out[v.duty_band] = (out[v.duty_band] || 0) + 1
  return Object.entries(out).sort((a, b) => b[1] - a[1])
})

async function load() {
  loading.value = true
  try {
    data.value = (await api.get(`/customers/${route.params.cid}`)).data
    err.value = ''
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}

// The customer is already known here, so the dialog only asks for what is left.
async function createEngagement() {
  creating.value = true
  try {
    await api.post('/engagements', {
      name: form.value.name.trim(),
      customer_id: route.params.cid,
    })
    form.value = { name: '' }
    showNew.value = false
    await load()
    err.value = ''
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  creating.value = false
}

onMounted(load)
watch(() => route.params.cid, load)
</script>

<template>
  <div class="page">
    <router-link class="back" to="/customers">← All customers</router-link>
    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-else-if="customer">
      <header class="spread chead">
        <div>
          <h1>{{ customer.legal_name }}</h1>
          <p class="muted" style="margin: 4px 0 0">{{ [customer.industry, customer.city, customer.country].filter(Boolean).join(' · ') || 'No details yet' }}</p>
        </div>
        <span class="badge" :class="customer.status === 'ACTIVE' ? 'ok' : 'warn'"><span class="dot" />{{ customer.status }}</span>
      </header>

      <div class="grid tiles">
        <div class="stattile"><div class="label">Engagements</div><div class="val">{{ engagements.length }}</div></div>
        <div class="stattile"><div class="label">Vehicles</div><div class="val">{{ vehicles.length }}</div></div>
        <div class="stattile"><div class="label">Billed fleet</div><div class="val">{{ totalBilled }}</div></div>
        <div class="stattile"><div class="label">Contacts</div><div class="val">{{ contacts.length }}</div></div>
      </div>

      <div class="card pad">
        <div class="spread" style="align-items: flex-start">
          <div>
            <h2 style="margin: 0">Engagements</h2>
            <p class="muted small" style="margin: 6px 0 12px">A customer signs a new engagement each time they lease more vehicles or add services.</p>
          </div>
          <button class="primary nowrap" @click="showNew = true">＋ New engagement</button>
        </div>
        <router-link v-for="e in engagements" :key="e.engagement_id" class="erow" :to="`/engagements/${e.engagement_id}`">
          <div class="einfo">
            <strong>{{ e.name }}</strong>
            <span class="muted small">{{ SCOPE_LABELS[e.scope] || 'Pending upload' }} · {{ e.fleet_size }} vehicles · created {{ (e.created_at || '').slice(0, 10) }}</span>
          </div>
          <StatusPill :status="e.status" />
        </router-link>
        <p v-if="!engagements.length" class="muted">No engagements yet.</p>
      </div>

      <div class="card pad">
        <div class="spread">
          <h2 style="margin: 0">Vehicles</h2>
          <router-link class="btn-link" :to="`/vehicles?customer_id=${customer.customer_id}`">See all →</router-link>
        </div>
        <div v-if="byDuty.length" class="row bands">
          <span v-for="[band, n] in byDuty" :key="band" class="pill role">{{ band.replace('_', ' ').toLowerCase() }} <b>{{ n }}</b></span>
        </div>
        <table v-if="vehicles.length" class="vtab">
          <thead><tr><th>Unit</th><th>Vehicle</th><th>Type</th><th>Ownership</th><th>Status</th></tr></thead>
          <tbody>
            <tr v-for="v in vehicles.slice(0, 8)" :key="v.vehicle_id">
              <td>{{ v.unit_number || v.vin || v.vehicle_id.slice(0, 6) }}</td>
              <td>{{ [v.year, v.make, v.model].filter(Boolean).join(' ') || '—' }}</td>
              <td class="muted">{{ v.body_class.replace('_', ' ').toLowerCase() }}</td>
              <td class="muted">{{ v.ownership === 'CUSTOMER_OWNED' ? 'Customer' : 'Wheels' }}</td>
              <td><span class="pill role">{{ v.status.replace('_', ' ').toLowerCase() }}</span></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">No vehicles mapped to this customer yet.</p>
      </div>

      <div class="card pad">
        <h2>Contacts</h2>
        <div v-for="c in contacts" :key="c.user_id" class="crow">
          <div class="avatar">{{ (c.name || c.email || '?').slice(0, 2).toUpperCase() }}</div>
          <div class="cinfo">
            <strong>{{ c.name || 'Not onboarded yet' }}</strong>
            <span class="muted small">{{ c.email }}<span v-if="c.phone"> · {{ c.phone }}</span></span>
          </div>
          <span class="muted small">{{ c.engagement_name }}</span>
        </div>
        <p v-if="!contacts.length" class="muted">No customer contacts invited yet.</p>
      </div>

      <Dialog
        :open="showNew"
        title="New engagement"
        :subtitle="`For ${customer.legal_name}. Create it first, then upload the agreements — we work out the type of each and which is in force.`"
        @close="showNew = false"
      >
        <label class="fld">
          <span class="label">Engagement name</span>
          <input v-model="form.name" placeholder="Spring lease — 40 units" @keyup.enter="createEngagement" />
        </label>
        <template #footer>
          <span class="sp" />
          <button class="ghost" @click="showNew = false">Cancel</button>
          <button class="primary" :disabled="creating || !form.name.trim()" @click="createEngagement">
            {{ creating ? 'Creating…' : 'Create engagement' }}
          </button>
        </template>
      </Dialog>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 1680px; margin: 0 auto; padding: 28px 32px 40px; display: flex; flex-direction: column; gap: 16px; }
.back { font-size: 13px; }
.chead h1 { margin: 0; }
.pad { padding: 20px; }
.tiles { grid-template-columns: repeat(4, 1fr); }
.erow { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); text-decoration: none; color: inherit; }
.erow:hover { text-decoration: none; }
.erow:hover .einfo strong { color: var(--accent); }
.einfo { display: flex; flex-direction: column; gap: 2px; }
.bands { gap: 6px; flex-wrap: wrap; margin: 4px 0 12px; }
.vtab { width: 100%; border-collapse: collapse; font-size: 13px; }
.vtab th { text-align: left; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); padding: 6px 8px 6px 0; border-bottom: 1px solid var(--line); }
.vtab td { padding: 8px 8px 8px 0; border-bottom: 1px solid var(--line); }
.pill.role {
  display: inline-flex; align-items: baseline; gap: 6px;
  background: var(--accent-weak); color: var(--accent-ink);
  font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  padding: 4px 10px; border-radius: 999px;
}
.pill.role b { font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: 0; }
.crow { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); }
.avatar { width: 32px; height: 32px; border-radius: 9px; background: var(--accent-weak); color: var(--accent-ink); display: grid; place-items: center; font-size: 11px; font-weight: 700; }
.cinfo { flex: 1; display: flex; flex-direction: column; }
.err { color: var(--risk); }
.nowrap { white-space: nowrap; }
.fld { display: flex; flex-direction: column; gap: 6px; }
@media (max-width: 720px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
</style>
