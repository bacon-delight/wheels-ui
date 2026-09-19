<script setup>
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import StatusPill from '../components/StatusPill.vue'
import { SCOPE_LABELS } from '../stores/engagement'
import { ALL_STAGES, stageLabel, stageMeta, useLifecycleStore } from '../stores/lifecycle'

const route = useRoute()
const router = useRouter()
const lc = useLifecycleStore()

// No step in the URL means the whole board: every step side by side, which is the view worth
// landing on. Naming one narrows to it.
const stageKey = computed(() =>
  route.params.stage ? String(route.params.stage).toUpperCase() : null,
)
const stage = computed(() => (stageKey.value ? stageMeta(stageKey.value) : null))
// A key the URL names but the product does not have. Rendering it as a step would state
// something false with total confidence, so the board takes over and says what happened.
const unknownStage = computed(() => !!stageKey.value && !stage.value)
const rows = computed(() => {
  if (unknownStage.value) return []
  return stageKey.value ? lc.inStage(stageKey.value) : lc.inFlight
})

const age = (iso) => {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000)
  if (days < 1) return 'today'
  return days === 1 ? '1 day' : `${days} days`
}
// How long something has been sitting is the question a board like this is for — an engagement
// three weeks into Review is the one worth chasing.
const stale = (iso) => iso && Date.now() - new Date(iso) > 14 * 86400000

onMounted(() => {
  if (!lc.loaded) lc.load()
})

function open(e) {
  router.push(`/engagements/${e.engagement_id}`)
}
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>{{ stage ? stage.label : 'Lifecycle' }}</h1>
        <p v-if="unknownStage" class="muted sub">
          There is no step called “{{ route.params.stage }}”. Pick one below.
        </p>
        <p v-else class="muted sub">
          {{ stage ? stage.blurb : 'Every contract that has not finished, and the step it is standing in.' }}
        </p>
      </div>
      <router-link v-if="stageKey" to="/lifecycle" class="btn-link">← All steps</router-link>
    </header>

    <p v-if="lc.err" class="err">{{ lc.err }}</p>

    <!-- The board: the five steps in order, each a button into its own list. -->
    <div class="board">
      <router-link
        v-for="s in ALL_STAGES"
        :key="s.key"
        :to="`/lifecycle/${s.key.toLowerCase()}`"
        class="col"
        :class="{ 'is-here': stageKey === s.key, empty: !lc.countFor(s.key) }"
      >
        <div class="colhead">
          <span class="lbl">{{ s.label }}</span>
        </div>
        <div class="count">{{ lc.countFor(s.key) }}</div>
        <div class="muted blurb">{{ s.blurb }}</div>
      </router-link>
    </div>

    <p v-if="stage" class="waiting">{{ stage.waiting }}</p>

    <div class="card">
      <div class="twrap">
        <table>
          <thead>
            <tr>
              <th>Engagement</th>
              <th>Customer</th>
              <th v-if="!stageKey">Step</th>
              <th>Status</th>
              <th>Scope</th>
              <th class="r">Waiting</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in rows" :key="e.engagement_id" class="erow" @click="open(e)">
              <td><span class="ename">{{ e.name }}</span></td>
              <td class="muted">{{ e.client_name }}</td>
              <td v-if="!stageKey" class="muted">{{ stageLabel(e.stage) }}</td>
              <td><StatusPill v-if="e.status" :status="e.status" /></td>
              <td class="muted">{{ SCOPE_LABELS[e.scope] || 'Pending upload' }}</td>
              <td class="r" :class="{ stale: stale(e.created_at) }">{{ age(e.created_at) }}</td>
            </tr>
            <tr v-if="!rows.length">
              <td :colspan="stageKey ? 5 : 6" class="muted empty-row">
                <template v-if="lc.err">Nothing could be loaded.</template>
                <template v-else-if="!lc.loaded">Loading…</template>
                <template v-else-if="unknownStage">Pick a step above.</template>
                <template v-else-if="stage">Nothing is in {{ stage.label }} right now.</template>
                <template v-else>Every engagement has completed its lifecycle.</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="muted foot">
      What the live engagements are worth is on
      <router-link to="/finance">Finance</router-link>.
    </p>
  </div>
</template>

<style scoped>
.page { max-width: 1680px; margin: 0 auto; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.head h1 { margin: 0; }
.sub { margin: 6px 0 0; max-width: 62ch; }
.err { color: var(--risk); background: var(--risk-weak); padding: 10px 14px; border-radius: 10px; }

/* Five columns that add up to the pipeline, each a way in. */
.board { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
.col {
  display: flex; flex-direction: column; gap: 4px; padding: 14px 16px;
  background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  text-decoration: none; color: inherit; transition: border-color 0.12s ease;
}
.col:hover { border-color: var(--line-strong); text-decoration: none; }
.col.is-here { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
.col.empty .count { color: var(--muted); }
.colhead { display: flex; align-items: center; gap: 8px; }
.colhead .lbl { font-weight: 600; font-size: 13.5px; }
.count { font-family: var(--serif); font-size: 30px; font-weight: 600; line-height: 1.1; }
.blurb { font-size: 12px; line-height: 1.45; }
.waiting {
  margin: 0; padding: 10px 14px; border-radius: 10px;
  background: var(--accent-weak); color: var(--accent-ink); font-size: 13.5px;
}
.twrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 11px 16px; border-top: 1px solid var(--line); font-size: 14px; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
/* Not `.row`: that is a global flex utility, and a table row given `display: flex` stops
   sharing columns with the rows above it. */
.erow { cursor: pointer; }
.erow:hover { background: var(--panel-2); }
.ename { font-weight: 600; color: var(--accent-ink); }
.r { text-align: right; font-variant-numeric: tabular-nums; }
.stale { color: var(--warn); font-weight: 600; }
.empty-row { padding: 20px 16px; }
.foot { font-size: 13px; margin: 0; }
@media (max-width: 1340px) { .board { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 900px) { .board { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) { .board { grid-template-columns: 1fr; } }
</style>
