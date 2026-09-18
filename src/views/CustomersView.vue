<script setup>
import { computed, onMounted, ref } from 'vue'

import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const customers = ref([])
const loading = ref(true)
const err = ref('')
const q = ref('')
const showNew = ref(false)
const creating = ref(false)
const form = ref({ legal_name: '', industry: '', city: '', primary_contact_email: '' })

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return customers.value
  return customers.value.filter((c) =>
    [c.legal_name, c.display_name, c.industry, c.city].some((v) => (v || '').toLowerCase().includes(needle)),
  )
})

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
      <button v-if="auth.isProvider" class="primary" @click="showNew = !showNew">
        {{ showNew ? 'Cancel' : '＋ New customer' }}
      </button>
    </div>

    <div v-if="showNew && auth.isProvider" class="card pad" style="margin-bottom: 18px">
      <h2>New customer</h2>
      <div class="grid two">
        <label class="fld"><span class="label">Legal name</span><input v-model="form.legal_name" placeholder="Apex Pvt Ltd" /></label>
        <label class="fld"><span class="label">Industry</span><input v-model="form.industry" placeholder="Logistics" /></label>
        <label class="fld"><span class="label">City</span><input v-model="form.city" placeholder="Bangalore" /></label>
        <label class="fld"><span class="label">Billing contact</span><input v-model="form.primary_contact_email" placeholder="ap@apex.com" /></label>
      </div>
      <button class="primary" style="margin-top: 14px" :disabled="creating || !form.legal_name.trim()" @click="create">
        {{ creating ? 'Creating…' : 'Create customer' }}
      </button>
    </div>

    <input v-if="customers.length" v-model="q" placeholder="Search customers…" style="max-width: 320px; margin-bottom: 16px" />
    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <div v-else class="grid cards">
      <router-link v-for="c in filtered" :key="c.customer_id" class="card ccard" :to="`/customers/${c.customer_id}`">
        <div class="spread">
          <h2>{{ c.legal_name }}</h2>
          <span class="badge" :class="c.status === 'ACTIVE' ? 'ok' : 'warn'"><span class="dot" />{{ c.status }}</span>
        </div>
        <p class="muted sub">{{ [c.industry, c.city].filter(Boolean).join(' · ') || 'No details yet' }}</p>
        <div class="row stats">
          <span><strong>{{ c.engagement_count }}</strong> engagement{{ c.engagement_count === 1 ? '' : 's' }}</span>
          <span class="muted">·</span>
          <span><strong>{{ c.fleet_size }}</strong> vehicles billed</span>
        </div>
      </router-link>
      <p v-if="!filtered.length" class="muted">{{ customers.length ? 'No customers match that search.' : 'No customers yet.' }}</p>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1000px; padding: 32px; }
.head { margin-bottom: 20px; }
.pad { padding: 20px; }
.cards { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.two { grid-template-columns: 1fr 1fr; }
.fld { display: flex; flex-direction: column; gap: 6px; }
.ccard { padding: 18px; text-decoration: none; color: inherit; }
.ccard:hover { text-decoration: none; border-color: var(--accent); box-shadow: 0 4px 20px rgba(6, 59, 131, 0.12); }
.ccard h2 { margin: 0 0 2px; font-size: 17px; }
.sub { margin: 0 0 12px; font-size: 13px; }
.stats { gap: 8px; font-size: 13px; }
.err { color: var(--risk); }
</style>
