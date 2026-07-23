<script setup>
import { onMounted, ref } from 'vue'

import { api } from '../services/api'

const users = ref([])
const loading = ref(true)
const err = ref('')
const email = ref('')
const name = ref('')
const busy = ref(false)
const notice = ref('')

async function load() {
  loading.value = true
  err.value = ''
  try {
    users.value = (await api.get('/users')).data.users
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}

async function add() {
  busy.value = true
  err.value = ''
  notice.value = ''
  try {
    await api.post('/users', { email: email.value.trim(), name: name.value.trim() || null })
    notice.value = `Invitation sent to ${email.value.trim()} with a temporary password.`
    email.value = ''
    name.value = ''
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = false
}

const initials = (u) =>
  (u.name || u.email || '?').split(/[@\s.]+/).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('')

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>Users</h1>
      <p class="muted" style="margin: 4px 0 0">Wheels team members — analysts &amp; finance. They can see every engagement.</p>
    </div>

    <div class="card pad addcard">
      <div class="label" style="margin-bottom: 10px">Add a team member</div>
      <div class="row">
        <input v-model="name" placeholder="Full name (optional)" style="max-width: 220px" />
        <input v-model="email" type="email" placeholder="name@wheels.com" @keyup.enter="add" />
        <button class="primary" :disabled="!email || busy" @click="add">{{ busy ? 'Adding…' : 'Add provider' }}</button>
      </div>
      <p v-if="notice" class="notice">{{ notice }}</p>
      <p v-if="err" class="err">{{ err }}</p>
    </div>

    <p v-if="loading" class="muted">Loading…</p>
    <div v-else class="card">
      <div class="urow" v-for="u in users" :key="u.user_id">
        <div class="ava">{{ initials(u) }}</div>
        <div class="uinfo">
          <div class="uname">{{ u.name || u.email }}</div>
          <div class="muted small">{{ u.email }}<span v-if="u.phone"> · {{ u.phone }}</span></div>
        </div>
        <span class="pill" :class="u.onboarded ? 'ok' : 'pending'">{{ u.onboarded ? 'Active' : 'Invited' }}</span>
      </div>
      <p v-if="!users.length" class="muted" style="padding: 18px">No team members yet.</p>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 780px; margin: 0 auto; padding: 32px; }
.head { margin-bottom: 22px; }
.small { font-size: 12px; }
.pad { padding: 20px 22px; }
.addcard { margin-bottom: 20px; }
.label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
.notice { color: var(--ok); background: var(--ok-weak); padding: 10px 14px; border-radius: 10px; margin: 12px 0 0; font-size: 13px; }
.err { color: var(--risk); background: var(--risk-weak); padding: 10px 14px; border-radius: 10px; margin: 12px 0 0; font-size: 13px; }
.urow { display: flex; align-items: center; gap: 14px; padding: 14px 22px; border-top: 1px solid var(--line); }
.urow:first-child { border-top: none; }
.ava { width: 36px; height: 36px; border-radius: 10px; background: var(--accent-weak); color: var(--accent-ink); display: grid; place-items: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }
.uinfo { flex: 1; min-width: 0; }
.uname { font-weight: 600; }
.pill { font-size: 12px; padding: 3px 10px; border-radius: 999px; font-weight: 600; }
.pill.ok { background: var(--ok-weak); color: var(--ok); }
.pill.pending { background: var(--warn-weak); color: var(--warn); }
</style>
