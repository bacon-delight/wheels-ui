<script setup>
import { onMounted, ref } from 'vue'

import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const engagements = ref([])
const loading = ref(true)
const err = ref('')
const name = ref('')
const clientName = ref('')
const creating = ref(false)

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
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  creating.value = false
}

onMounted(load)
</script>

<template>
  <div class="container stack">
    <h1>Engagements</h1>

    <div v-if="auth.isProvider" class="card" style="padding: 16px">
      <h2>New engagement</h2>
      <div class="row">
        <input v-model="name" placeholder="Engagement name — e.g. Apex Field Services" />
        <input v-model="clientName" placeholder="Client legal name — e.g. Apex Field Services LLC" />
        <button class="primary" :disabled="!name || !clientName || creating" @click="create">
          Create
        </button>
      </div>
    </div>

    <p v-if="err" class="muted">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <div v-else class="grid">
      <router-link
        v-for="e in engagements"
        :key="e.engagement_id"
        :to="`/engagements/${e.engagement_id}`"
        class="card eng"
      >
        <div class="spread">
          <h2 style="margin: 0">{{ e.name }}</h2>
          <span class="pill st">{{ e.status }}</span>
        </div>
        <div class="muted">{{ e.client_name }}</div>
      </router-link>
      <p v-if="!engagements.length" class="muted">No engagements yet.</p>
    </div>
  </div>
</template>

<style scoped>
.eng { padding: 16px; text-decoration: none; color: inherit; display: block; }
.eng:hover { border-color: var(--accent); text-decoration: none; }
.pill.st { background: var(--accent-weak); color: var(--accent); }
</style>
