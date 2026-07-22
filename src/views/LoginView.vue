<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { completeNewPassword, signIn } from '../services/auth'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const newPassword = ref('')
const challengeUser = ref(null)
const err = ref('')
const busy = ref(false)

function goNext() {
  const next = typeof route.query.next === 'string' ? route.query.next : '/'
  router.replace(next)
}

async function submit() {
  busy.value = true
  err.value = ''
  try {
    const r = await signIn(email.value.trim(), password.value)
    if (r.newPasswordRequired) {
      challengeUser.value = r.user
    } else {
      auth.setSession(r.session)
      goNext()
    }
  } catch (e) {
    err.value = e.message || 'Sign-in failed'
  }
  busy.value = false
}

async function setNewPassword() {
  busy.value = true
  err.value = ''
  try {
    const session = await completeNewPassword(challengeUser.value, newPassword.value)
    auth.setSession(session)
    goNext()
  } catch (e) {
    err.value = e.message || 'Could not set password'
  }
  busy.value = false
}
</script>

<template>
  <div class="wrap">
    <div class="card panel">
      <div class="mark">Wheels</div>
      <h1>Contract Intelligence</h1>

      <template v-if="!challengeUser">
        <p class="muted sub">Sign in to review and approve contract billing terms.</p>
        <form class="stack" @submit.prevent="submit">
          <input v-model="email" type="email" placeholder="Email" autocomplete="username" required />
          <input
            v-model="password"
            type="password"
            placeholder="Password"
            autocomplete="current-password"
            required
          />
          <button class="primary" type="submit" :disabled="busy">
            {{ busy ? 'Signing in…' : 'Sign in' }}
          </button>
        </form>
      </template>

      <template v-else>
        <p class="muted sub">First sign-in — please set a new password.</p>
        <form class="stack" @submit.prevent="setNewPassword">
          <input
            v-model="newPassword"
            type="password"
            placeholder="New password (min 12 chars)"
            autocomplete="new-password"
            required
          />
          <button class="primary" type="submit" :disabled="busy">
            {{ busy ? 'Saving…' : 'Set password & continue' }}
          </button>
        </form>
      </template>

      <p v-if="err" class="err">{{ err }}</p>
    </div>
  </div>
</template>

<style scoped>
.wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.panel { padding: 32px; width: 360px; max-width: 100%; }
.mark { font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--accent); font-size: 13px; }
.panel h1 { margin: 6px 0 4px; }
.sub { margin: 0 0 16px; }
.err { color: var(--risk); margin: 12px 0 0; font-size: 13px; }
</style>
