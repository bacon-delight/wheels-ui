<script setup>
import { computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'

import StatusPill from '../components/StatusPill.vue'
import { useEngagementStore } from '../stores/engagement'

const route = useRoute()
const eng = useEngagementStore()

const tabs = computed(() => {
  const base = [
    { name: 'eng-overview', label: 'Overview' },
    { name: 'eng-terms', label: 'Terms' },
    { name: 'eng-billing', label: 'Billing' },
    { name: 'eng-status', label: 'Status' },
  ]
  if (eng.isProvider) base.push({ name: 'eng-people', label: 'People' })
  return base
})

function reload() {
  eng.load(route.params.eid)
}
onMounted(reload)
watch(() => route.params.eid, reload)
</script>

<template>
  <div class="wrap" v-if="eng.data">
    <router-link to="/" class="back muted">← All engagements</router-link>

    <header class="ehead">
      <div>
        <h1>{{ eng.data.engagement.name }}</h1>
        <div class="muted sub">{{ eng.data.engagement.client_name }}</div>
      </div>
      <StatusPill v-if="eng.status" :status="eng.status" />
    </header>

    <nav class="tabs">
      <router-link
        v-for="t in tabs"
        :key="t.name"
        :to="{ name: t.name, params: { eid: route.params.eid } }"
        class="tab"
        exact-active-class="active"
      >{{ t.label }}</router-link>
    </nav>

    <p v-if="eng.err" class="err">{{ eng.err }}</p>

    <router-view />
  </div>
  <div class="wrap muted" v-else>Loading…</div>
</template>

<style scoped>
.wrap { max-width: 1000px; margin: 0 auto; padding: 28px 32px 60px; }
.back { display: inline-block; font-size: 13px; margin-bottom: 14px; }
.ehead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.sub { font-size: 15px; margin-top: 4px; }
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin: 22px 0 24px; }
.tab {
  padding: 10px 16px; color: var(--ink-soft); font-weight: 500; text-decoration: none;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tab:hover { color: var(--ink); text-decoration: none; }
.tab.active { color: var(--accent-ink); border-bottom-color: var(--accent); font-weight: 600; }
.err { color: var(--risk); background: var(--risk-weak); padding: 10px 14px; border-radius: 10px; }
</style>
