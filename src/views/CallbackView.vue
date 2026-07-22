<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { handleCallback } from '../services/auth'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()
const error = ref('')

onMounted(async () => {
  try {
    const user = await handleCallback()
    auth.setUser(user)
    auth.ready = true
    router.replace('/')
  } catch (e) {
    error.value = e.message || String(e)
  }
})
</script>

<template>
  <div class="container">
    <p v-if="!error" class="muted">Signing you in…</p>
    <div v-else class="stack">
      <p class="muted">Sign-in failed: {{ error }}</p>
      <router-link to="/login">Try again</router-link>
    </div>
  </div>
</template>
