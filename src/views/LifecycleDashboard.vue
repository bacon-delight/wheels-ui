<script setup>
import { computed, onMounted } from 'vue'

import StatusPill from '../components/StatusPill.vue'
import { STAGES, stageLabel, useLifecycleStore } from '../stores/lifecycle'

const lc = useLifecycleStore()
onMounted(() => {
  if (!lc.loaded) lc.load()
})

const total = computed(() => lc.engagements.length)
const active = computed(() => lc.countFor('ACTIVE'))
const inFlight = computed(() => lc.inFlight.length)

// Time in the current step, not age of the deal: `created_at` counts from the handshake and
// would call a contract signed yesterday a year overdue.
const daysIn = (e) => {
  const iso = e.status_since || e.created_at
  return iso ? Math.floor((Date.now() - new Date(iso)) / 86400000) : 0
}

// The widest bar sets the scale, so the shape of the pipeline is readable even when the
// biggest step holds three engagements.
const peak = computed(() => Math.max(1, ...STAGES.map((s) => lc.countFor(s.key))))

// What is actually waiting on somebody, oldest first. A dashboard that only counts tells you
// the pipeline is fine; this says which deal has been sitting for three weeks.
const waiting = computed(() =>
  [...lc.inFlight]
    .sort((a, b) => daysIn(b) - daysIn(a))
    .slice(0, 8),
)

// Where an engagement is stuck matters more than how long the average takes: Billing Setup is
// automatic, so anything sitting in it has gone wrong rather than slowly.
const stalled = computed(() => lc.inStage('BILLING_SETUP'))

const stageRows = computed(() =>
  STAGES.map((s) => ({
    ...s,
    count: lc.countFor(s.key),
    share: Math.round((100 * lc.countFor(s.key)) / peak.value),
    oldest: Math.max(0, ...lc.inStage(s.key).map(daysIn)),
  })),
)
</script>

<template>
  <div class="page">
    <header class="head">
      <div>
        <h1>Lifecycle</h1>
        <p class="muted sub">
          Where every contract stands, from the first conversation to a live invoice.
        </p>
      </div>
      <router-link to="/finance" class="btn-link">Revenue and collections →</router-link>
    </header>

    <p v-if="lc.err" class="err">{{ lc.err }}</p>

    <div class="tiles">
      <div class="tile">
        <div class="label">In flight</div>
        <div class="val">{{ inFlight }}</div>
        <div class="muted small">contracts still moving through the five steps</div>
      </div>
      <div class="tile">
        <div class="label">Live</div>
        <div class="val">{{ active }}</div>
        <div class="muted small">signed, audited and billing</div>
      </div>
      <div class="tile">
        <div class="label">Total</div>
        <div class="val">{{ total }}</div>
        <div class="muted small">engagements on the book</div>
      </div>
      <div class="tile" :class="{ attn: stalled.length }">
        <div class="label">Stuck in setup</div>
        <div class="val">{{ stalled.length }}</div>
        <!-- Billing setup runs itself, so anything resting there has failed rather than queued. -->
        <div class="muted small">billing is automatic — anything here needs a look</div>
      </div>
    </div>

    <div class="card pad">
      <h2>The five steps</h2>
      <p class="muted small" style="margin: 6px 0 16px">
        How the work is distributed, and the longest anything has been waiting in each.
      </p>
      <router-link
        v-for="(s, i) in stageRows"
        :key="s.key"
        :to="`/lifecycle/${s.key.toLowerCase()}`"
        class="srow"
      >
        <span class="sn">{{ i + 1 }}</span>
        <span class="sname">{{ s.label }}</span>
        <span class="strack"><span class="sfill" :style="{ width: s.share + '%' }" /></span>
        <span class="scount">{{ s.count }}</span>
        <span class="sage muted" :class="{ stale: s.oldest > 14 }">
          {{ s.count ? `${s.oldest}d oldest` : '—' }}
        </span>
      </router-link>
    </div>

    <div class="card pad">
      <div class="spread" style="margin-bottom: 4px">
        <h2 style="margin: 0">Waiting longest</h2>
        <router-link to="/lifecycle" class="btn-link small">Open the board →</router-link>
      </div>
      <p class="muted small" style="margin: 6px 0 12px">
        The contracts that have stood longest in the step they are in. Longest first.
      </p>
      <div class="twrap">
        <table>
          <thead>
            <tr><th>Engagement</th><th>Customer</th><th>Step</th><th>Status</th><th class="r">Age</th></tr>
          </thead>
          <tbody>
            <tr v-for="e in waiting" :key="e.engagement_id">
              <td>
                <router-link :to="`/engagements/${e.engagement_id}`" class="ename">{{ e.name }}</router-link>
              </td>
              <td class="muted">{{ e.client_name }}</td>
              <td class="muted">{{ stageLabel(e.stage) }}</td>
              <td><StatusPill v-if="e.status" :status="e.status" /></td>
              <td class="r" :class="{ stale: daysIn(e) > 14 }">{{ daysIn(e) }}d</td>
            </tr>
            <tr v-if="!waiting.length">
              <td colspan="5" class="muted" style="padding: 18px">
                <template v-if="lc.err">Nothing could be loaded.</template>
                <template v-else-if="!lc.loaded">Loading…</template>
                <template v-else>Nothing in flight — every contract has gone live.</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page { max-width: 1680px; margin: 0 auto; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.head h1 { margin: 0; }
.sub { margin: 6px 0 0; max-width: 60ch; }
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.err { color: var(--risk); background: var(--risk-weak); padding: 10px 14px; border-radius: 10px; }

.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px; }
.tile.attn { border-left: 3px solid var(--warn); }
.tile .val { font-family: var(--serif); font-size: 32px; font-weight: 600; line-height: 1.15; margin: 2px 0 4px; }

/* One row per step: name, how much is in it, and how long the oldest has been there. */
.srow {
  display: grid; grid-template-columns: 22px 150px 1fr 40px 90px;
  align-items: center; gap: 12px; padding: 9px 0;
  border-bottom: 1px solid var(--line); text-decoration: none; color: inherit;
}
.srow:last-of-type { border-bottom: none; }
.srow:hover { text-decoration: none; }
.srow:hover .sname { color: var(--accent-ink); }
.sn {
  width: 20px; height: 20px; border-radius: 999px; display: inline-grid; place-items: center;
  background: var(--accent-weak); color: var(--accent-ink); font-size: 11px; font-weight: 700;
}
.sname { font-weight: 500; font-size: 14px; }
.strack { height: 8px; background: var(--panel-2); border-radius: 999px; overflow: hidden; }
.sfill { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
.scount { font-variant-numeric: tabular-nums; font-weight: 600; text-align: right; }
.sage { font-size: 12px; text-align: right; font-variant-numeric: tabular-nums; }
.stale { color: var(--warn); font-weight: 600; }

.twrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 14px; border-top: 1px solid var(--line); font-size: 14px; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
.ename { font-weight: 600; }
.r { text-align: right; font-variant-numeric: tabular-nums; }
@media (max-width: 1100px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 620px) {
  .tiles { grid-template-columns: 1fr; }
  .srow { grid-template-columns: 20px 1fr 40px; }
  .strack, .sage { display: none; }
}
</style>
