<script setup>
import { onMounted, ref } from 'vue'

import StatusPill from '../components/StatusPill.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const engagements = ref([])
const loading = ref(true)
const err = ref('')
const name = ref('')
const clientName = ref('')
const creating = ref(false)
const showNew = ref(false)

async function load() {
  loading.value = true
  err.value = ''
  try {
    engagements.value = (await api.get('/engagements')).data.engagements
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}

async function create() {
  creating.value = true
  err.value = ''
  try {
    await api.post('/engagements', { name: name.value, client_name: clientName.value })
    name.value = ''
    clientName.value = ''
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
        <p class="muted" style="margin: 4px 0 0">Client onboarding &amp; billing-term review</p>
      </div>
      <button v-if="auth.isProvider" class="primary" @click="showNew = !showNew">＋ New engagement</button>
    </div>

    <div v-if="showNew && auth.isProvider" class="card np">
      <div class="row">
        <input v-model="name" placeholder="Engagement name — e.g. Apex Field Services" />
        <input v-model="clientName" placeholder="Client legal name — e.g. Apex Field Services LLC" />
        <button class="primary" :disabled="!name || !clientName || creating" @click="create">
          {{ creating ? 'Creating…' : 'Create' }}
        </button>
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <div v-else class="grid cards">
      <router-link v-for="e in engagements" :key="e.engagement_id" :to="`/engagements/${e.engagement_id}`" class="card ecard">
        <div class="spread">
          <h2 style="margin: 0">{{ e.name }}</h2>
          <StatusPill v-if="e.status" :status="e.status" />
        </div>
        <div class="muted">{{ e.client_name }}</div>
      </router-link>
      <p v-if="!engagements.length" class="muted">No engagements yet.</p>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1000px; margin: 0 auto; padding: 32px; }
.head { margin-bottom: 24px; }
.np { padding: 16px; margin-bottom: 20px; }
.err { color: var(--risk); }
.cards { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.ecard { padding: 20px; text-decoration: none; color: inherit; display: block; transition: all 0.12s; }
.ecard:hover { text-decoration: none; border-color: var(--accent); box-shadow: 0 4px 20px rgba(209, 85, 43, 0.1); }
.ecard h2 { font-size: 18px; }
</style>
