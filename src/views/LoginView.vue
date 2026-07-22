<script setup>
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
</script>

<template>
  <div class="wrap">
    <div class="card panel">
      <div class="mark">Wheels</div>
      <h1>Contract Intelligence</h1>
      <p class="muted">
        Extract billing terms from fleet MSA &amp; MLA contracts, review them side-by-side with
        the source, approve, and hand off to billing — no manual keying.
      </p>
      <button class="primary" style="width: 100%; margin-top: 8px" @click="auth.login()">
        Sign in
      </button>
    </div>
  </div>
</template>

<style scoped>
.wrap { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
.panel { padding: 32px; max-width: 380px; text-align: center; }
.mark { font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; color: var(--accent); font-size: 13px; }
.panel h1 { margin: 6px 0 12px; }
</style>
