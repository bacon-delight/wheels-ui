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
const scope = ref('LEASE_AND_SERVICE')
const filterCustomer = ref('')
const creating = ref(false)
const showNew = ref(false)

// The flat list stays the cross-customer worklist; the filter narrows it to one customer.
const shown = computed(() =>
  filterCustomer.value
    ? engagements.value.filter((e) => e.customer_id === filterCustomer.value)
    : engagements.value,
)
const customerName = (id) => customers.value.find((c) => c.customer_id === id)?.legal_name
const customerOptions = computed(() => customers.value.map((c) => ({ value: c.customer_id, label: c.legal_name })))
const customerFilterOptions = computed(() => [{ value: '', label: 'All customers' }, ...customerOptions.value])
const scopeOptions = Object.entries(SCOPE_LABELS).map(([value, label]) => ({ value, label }))

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
    await api.post('/engagements', {
      name: name.value,
      customer_id: customerId.value,
      scope: scope.value,
    })
    name.value = ''
    customerId.value = ''
    scope.value = 'LEASE_AND_SERVICE'
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
      <button v-if="auth.isProvider" class="primary" @click="showNew = true">＋ New engagement</button>
    </div>


    <div v-if="auth.isProvider && customers.length" class="row" style="margin-bottom: 14px">
      <div style="max-width: 260px; width: 100%">
        <Dropdown v-model="filterCustomer" :options="customerFilterOptions" placeholder="All customers" />
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <div v-else class="grid cards">
      <router-link v-for="e in shown" :key="e.engagement_id" :to="`/engagements/${e.engagement_id}`" class="card ecard">
        <div class="spread">
          <h2 style="margin: 0">{{ e.name }}</h2>
          <StatusPill v-if="e.status" :status="e.status" />
        </div>
        <div class="muted">{{ customerName(e.customer_id) || e.client_name }}</div>
        <div class="muted small meta">{{ SCOPE_LABELS[e.scope] || e.scope }} · {{ e.fleet_size }} vehicles</div>
      </router-link>
      <p v-if="!shown.length" class="muted">{{ engagements.length ? 'No engagements for that customer.' : 'No engagements yet.' }}</p>
    </div>

    <Dialog
      :open="showNew"
      title="New engagement"
      subtitle="Scope decides which agreements apply: lease needs the MLA, service needs the MSA, both need both."
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
      <label class="fld" style="margin-top: 14px">
        <span class="label">Scope</span>
        <Dropdown v-model="scope" :options="scopeOptions" />
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
.page { max-width: 1000px; margin: 0 auto; padding: 32px; }
.head { margin-bottom: 24px; }
.np { padding: 16px; margin-bottom: 20px; }
.err { color: var(--risk); }
.fld { display: flex; flex-direction: column; gap: 6px; }
.meta { margin-top: 4px; }
.cards { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.ecard { padding: 20px; text-decoration: none; color: inherit; display: block; transition: all 0.12s; }
.ecard:hover { text-decoration: none; border-color: var(--accent); box-shadow: 0 4px 20px rgba(6, 59, 131, 0.12); }
.ecard h2 { font-size: 18px; }
</style>
