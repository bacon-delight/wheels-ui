<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

import OnboardingView from './views/OnboardingView.vue'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const route = useRoute()

const bare = computed(() => route.name === 'login')

function ensureProfile() {
  if (auth.isAuthenticated && !auth.profileChecked) auth.fetchProfile()
}
onMounted(ensureProfile)
watch(() => auth.isAuthenticated, ensureProfile)
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

  <div v-else-if="auth.isAuthenticated && !auth.profileChecked" class="loading">Loading…</div>

  <OnboardingView v-else-if="auth.needsOnboarding" />

  <div v-else class="shell">
    <aside class="sidebar">
      <div class="logo">
        <span class="mark">◈</span>
        <span class="wordmark">Wheels</span>
      </div>

      <nav class="nav">
        <router-link to="/" class="navitem" active-class="active">
          <span class="ic">▤</span> Engagements
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
  background: var(--panel);
  border-right: 1px solid var(--line);
  padding: 20px 16px;
}
.logo { display: flex; align-items: center; gap: 10px; padding: 6px 8px 24px; }
.mark { color: var(--accent); font-size: 20px; }
.wordmark { font-family: var(--serif); font-size: 20px; font-weight: 600; letter-spacing: -0.01em; }
.nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.navitem {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 10px; color: var(--ink-soft);
  font-weight: 500; text-decoration: none;
}
.navitem:hover { background: var(--panel-2); text-decoration: none; }
.navitem.active { background: var(--accent-weak); color: var(--accent-ink); font-weight: 600; }
.navitem .ic { width: 18px; text-align: center; opacity: 0.8; }
.userbox {
  display: flex; align-items: center; gap: 10px;
  padding: 10px; border-top: 1px solid var(--line); margin-top: 8px;
}
.avatar {
  width: 34px; height: 34px; border-radius: 10px; flex-shrink: 0;
  background: var(--accent); color: #fff; display: grid; place-items: center;
  font-size: 12px; font-weight: 700;
}
.uinfo { flex: 1; min-width: 0; }
.uname { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.urole { font-size: 12px; color: var(--muted); }
.content { overflow-y: auto; }
.loading { display: grid; place-items: center; height: 100vh; color: var(--muted); }
@media (max-width: 720px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}
</style>
