<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'

import { useAuthStore } from './stores/auth'
import { ALL_STAGES, useLifecycleStore } from './stores/lifecycle'
import logo from './assets/wheels-logo.png'

const auth = useAuthStore()
const route = useRoute()

const bare = computed(() => ['login', 'onboarding'].includes(route.name))
const navActive = computed(() => {
  const p = route.path
  // New branches go before the catch-all, or every unknown path highlights Engagements.
  if (p.startsWith('/dashboard')) return 'dashboard'
  if (p.startsWith('/lifecycle')) return 'lifecycle'
  if (p.startsWith('/finance')) return 'finance'
  if (p.startsWith('/customers')) return 'customers'
  if (p.startsWith('/services')) return 'services'
  if (p.startsWith('/vehicles')) return 'vehicles'
  if (p.startsWith('/users')) return 'users'
  return 'engagements'
})
// The steps hang under Lifecycle rather than behind it: which step has work waiting is the
// question, and an extra click to see the answer is an extra click every time.
const lifecycle = useLifecycleStore()
const openLifecycle = computed(() => navActive.value === 'lifecycle')
watch(
  () => [auth.isProvider, openLifecycle.value],
  ([isProvider, open]) => {
    if (isProvider && open && !lifecycle.loaded) lifecycle.load()
  },
  { immediate: true },
)
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
        <div class="product">Contract Intelligence</div>
      </div>

      <nav class="nav">
        <router-link v-if="auth.isProvider" to="/dashboard" class="navitem" :class="{ active: navActive === 'dashboard' }">
          <span class="ic">◐</span> Dashboard
        </router-link>
        <router-link v-if="auth.isProvider" to="/lifecycle" class="navitem" :class="{ active: navActive === 'lifecycle' }">
          <span class="ic">◷</span> Lifecycle
        </router-link>
        <!-- Expanded only while you are in it: five permanent sub-items would crowd out
             everything else in the sidebar for the sake of a page nobody is on. -->
        <div v-if="auth.isProvider && openLifecycle" class="substeps">
          <!-- Which step is selected comes from the router's own exact-active class rather
               than a second copy of the matching logic here, which can only drift from it. -->
          <router-link
            v-for="s in ALL_STAGES"
            :key="s.key"
            :to="`/lifecycle/${s.key.toLowerCase()}`"
            class="substep"
          >
            <span class="steplabel">{{ s.label }}</span>
            <span v-if="lifecycle.countFor(s.key)" class="stepn">{{ lifecycle.countFor(s.key) }}</span>
          </router-link>
        </div>
        <router-link v-if="auth.isProvider" to="/finance" class="navitem" :class="{ active: navActive === 'finance' }">
          <span class="ic">◎</span> Finance
        </router-link>
        <router-link v-if="auth.isProvider" to="/customers" class="navitem" :class="{ active: navActive === 'customers' }">
          <span class="ic">◈</span> Customers
        </router-link>
        <router-link to="/engagements" class="navitem" :class="{ active: navActive === 'engagements' }">
          <span class="ic">▤</span> Engagements
        </router-link>
        <router-link v-if="auth.isProvider" to="/services" class="navitem" :class="{ active: navActive === 'services' }">
          <span class="ic">◇</span> Services
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
          <div class="urole">{{ auth.isProvider ? 'Platform Employee' : 'Customer' }}</div>
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
/* The logo artwork shares the sidebar's brand-blue background, so it sits flush with no tile. */
.logo { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 6px 20px; }
.logo img { width: 104px; height: auto; display: block; }
.product {
  font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--sky); text-align: center;
}
.nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
.navitem {
  display: flex; align-items: center; gap: 11px;
  padding: 10px 12px; border-radius: 10px; color: var(--sky-weak);
  font-weight: 500; text-decoration: none;
}
.navitem:hover { background: rgba(255, 255, 255, 0.08); text-decoration: none; }
.navitem.active { background: rgba(255, 255, 255, 0.14); color: #fff; font-weight: 600; }
.navitem .ic { width: 18px; text-align: center; opacity: 0.8; }
.substeps { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 4px 15px; padding-left: 14px; border-left: 1px solid rgba(255, 255, 255, 0.16); }
.substep {
  display: flex; align-items: center; gap: 9px; padding: 6px 10px; border-radius: 8px;
  color: var(--sky-weak); font-size: 13px; text-decoration: none;
}
.substep:hover { background: rgba(255, 255, 255, 0.08); text-decoration: none; }
/* The rule above it draws the branch; the selected step claims a piece of it, so which one
   you are on is legible without reading the labels. */
.substep { position: relative; }
.substep.router-link-exact-active {
  background: rgba(255, 255, 255, 0.16); color: #fff; font-weight: 600;
}
.substep.router-link-exact-active::before {
  content: ''; position: absolute; left: -15px; top: 4px; bottom: 4px;
  width: 3px; border-radius: 999px; background: var(--sky);
}
.steplabel { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* Where there is work waiting in a step, how much. The steps are in order on the screen, so
   numbering them as well would say the same thing twice. */
.stepn {
  font-size: 11px; font-variant-numeric: tabular-nums; text-align: center;
  background: rgba(255, 255, 255, 0.16); border-radius: 999px; padding: 1px 7px; color: #fff;
}
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
.urole { font-size: 11px; color: var(--sky); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.content { overflow-y: auto; }
.loading { display: grid; place-items: center; height: 100vh; color: var(--muted); }
@media (max-width: 720px) {
  .shell { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}
</style>
