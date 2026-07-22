<script setup>
import { useRoute } from 'vue-router'

import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const route = useRoute()
</script>

<template>
  <div class="app">
    <header v-if="route.name !== 'login' && route.name !== 'callback'" class="topbar">
      <div class="brand">
        <router-link to="/" class="brand-link">Wheels <span>Contract Intelligence</span></router-link>
      </div>
      <div v-if="auth.isAuthenticated" class="row">
        <span class="pill" :class="auth.isProvider ? 'prov' : 'client'">
          {{ auth.isProvider ? 'Provider' : 'Client' }}
        </span>
        <span class="muted">{{ auth.email }}</span>
        <button class="ghost sm" @click="auth.logout()">Sign out</button>
      </div>
    </header>
    <main><router-view /></main>
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 24px;
  background: #fff;
  border-bottom: 1px solid var(--line);
}
.brand-link { color: var(--brand); font-weight: 700; font-size: 15px; text-decoration: none; }
.brand-link span { color: var(--accent); font-weight: 600; }
.pill.prov { background: var(--accent-weak); color: var(--accent); }
.pill.client { background: #eef0f2; color: var(--muted); }
</style>
