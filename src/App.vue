<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from './stores/auth'
import logo from './assets/wheels-logo.png'

const auth = useAuthStore()
const route = useRoute()

const bare = computed(() => ['login', 'onboarding'].includes(route.name))
const navActive = computed(() => {
  const p = route.path
  // New branches go before the catch-all, or every unknown path highlights Engagements.
  if (p.startsWith('/dashboard') || p.startsWith('/finance')) return 'dashboard'
  if (p.startsWith('/customers')) return 'customers'
  if (p.startsWith('/vehicles')) return 'vehicles'
  if (p.startsWith('/users')) return 'users'
  return 'engagements'
})
const initials = computed(() =>
  (auth.name || auth.email || '?')
    .split(/[@\s.]+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || '')
    .join(''),
)
</script>

<template>
  <router-view v-if="bare" />

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="logo">
        <img :src="logo" alt="Wheels" />
      </div>

      <nav class="nav">
        <router-link v-if="auth.isProvider" to="/dashboard" class="navitem" :class="{ active: navActive === 'dashboard' }">
          <span class="ic">◐</span> Dashboard
        </router-link>
        <router-link v-if="auth.isProvider" to="/customers" class="navitem" :class="{ active: navActive === 'customers' }">
          <span class="ic">◈</span> Customers
        </router-link>
        <router-link to="/engagements" class="navitem" :class="{ active: navActive === 'engagements' }">
          <span class="ic">▤</span> Engagements
        </router-link>
        <router-link v-if="auth.isProvider" to="/vehicles" class="navitem" :class="{ active: navActive === 'vehicles' }">
          <span class="ic">⬢</span> Vehicles
        </router-link>
        <router-link v-if="auth.isProvider" to="/users" class="navitem" :class="{ active: navActive === 'users' }">
          <span class="ic">◍</span> Users
        </router-link>
      </nav>

      <div class="userbox" v-if="auth.isAuthenticated">
        <div class="avatar">{{ initials }}</div>
        <div class="uinfo">
          <div class="uname">{{ auth.name }}</div>
          <div class="urole">{{ auth.isProvider ? 'Provider' : 'Client' }}</div>
        </div>
        <button class="ghost sm" title="Sign out" @click="auth.logout()">↪</button>
      </div>
    </aside>

    <main class="content"><router-view /></main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 244px 1fr; height: 100vh; }
.sidebar {
  display: flex;
  flex-direction: column;
  background: var(--brand);
  border-right: 1px solid var(--brand);
  padding: 20px 16px;
}
/* The logo artwork shares the sidebar's brand-blue background, so it sits flush with no visible tile. */
.logo { display: flex; align-items: center; padding: 2px 6px 18px; }
.logo img { width: 150px; height: auto; display: block; }
.nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.navitem {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 10px; color: var(--sky-weak);
  font-weight: 500; text-decoration: none;
}
.navitem:hover { background: rgba(255, 255, 255, 0.08); text-decoration: none; }
.navitem.active { background: rgba(255, 255, 255, 0.14); color: #fff; font-weight: 600; }
.navitem .ic { width: 18px; text-align: center; opacity: 0.8; }
.userbox {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; border-top: 1px solid rgba(255, 255, 255, 0.16); margin-top: 8px;
}
.userbox button { color: var(--sky-weak); }
.userbox button:hover { background: rgba(255, 255, 255, 0.1); border-color: transparent; color: #fff; }
.avatar {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  background: var(--cta); color: var(--cta-ink); display: grid; place-items: center;
  font-size: 12px; font-weight: 700;
}
.uinfo { flex: 1; min-width: 0; }
.uname { font-weight: 600; font-size: 13px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.urole { font-size: 12px; color: var(--sky); }
.content { overflow-y: auto; }
.loading { display: grid; place-items: center; height: 100vh; color: var(--muted); }
@media (max-width: 720px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}
</style>
