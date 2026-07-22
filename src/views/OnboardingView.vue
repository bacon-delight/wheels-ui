<script setup>
import { ref } from 'vue'

import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const name = ref(auth.profile?.name || '')
const phone = ref(auth.profile?.phone || '')
const busy = ref(false)
const err = ref('')

async function save() {
  busy.value = true
  err.value = ''
  try {
    const r = await api.patch('/me', { name: name.value.trim(), phone: phone.value.trim() })
    auth.markOnboarded(r.data.profile)
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = false
}
</script>

<template>
  <div class="wrap">
    <div class="card panel">
      <div class="mark">Wheels</div>
      <h1>Welcome</h1>
      <p class="muted sub">
        Before you continue, tell us who you are. This is shown to the people you work with on
        each engagement.
      </p>
      <form class="stack" @submit.prevent="save">
        <label class="fld">
          <span class="label">Full name</span>
          <input v-model="name" placeholder="Jane Doe" autocomplete="name" required />
        </label>
        <label class="fld">
          <span class="label">Phone number</span>
          <input v-model="phone" placeholder="+1 555 000 1234" autocomplete="tel" required />
        </label>
        <button class="primary" type="submit" :disabled="busy || !name.trim() || !phone.trim()">
          {{ busy ? 'Saving…' : 'Continue' }}
        </button>
      </form>
      <p v-if="err" class="err">{{ err }}</p>
    </div>
  </div>
</template>

<style scoped>
.wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.panel { padding: 34px; width: 400px; max-width: 100%; }
.mark { font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--accent); font-size: 13px; }
.panel h1 { margin: 8px 0 6px; }
.sub { margin: 0 0 20px; }
.fld { display: flex; flex-direction: column; gap: 6px; }
.err { color: var(--risk); margin: 12px 0 0; font-size: 13px; }
</style>
