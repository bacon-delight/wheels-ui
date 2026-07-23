<script setup>
import { computed, onMounted, ref } from 'vue'

import StatusPill from '../components/StatusPill.vue'
import { api } from '../services/api'

const data = ref(null)
const loading = ref(true)
const err = ref('')

const usd = (n, dp = 0) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`

const totals = computed(() => data.value?.totals || {})
const funnel = computed(() => data.value?.funnel || [])
const rows = computed(() => data.value?.engagements || [])
const funnelMax = computed(() => Math.max(1, ...funnel.value.map((s) => s.count)))

async function load() {
  loading.value = true
  err.value = ''
  try {
    data.value = (await api.get('/finance/dashboard')).data
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
}
onMounted(load)
</script>

<template>
  <div class="page">
    <div class="head">
      <h1>Finance</h1>
      <p class="muted" style="margin: 4px 0 0">Portfolio, recurring revenue &amp; onboarding pipeline</p>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-else-if="data">
      <!-- Headline revenue -->
      <div class="tiles">
        <div class="tile hero">
          <div class="label">Monthly recurring</div>
          <div class="big">{{ usd(totals.monthly_recurring) }}<span class="per">/mo</span></div>
          <div class="muted small">{{ usd(totals.annualized) }} annualized</div>
        </div>
        <div class="tile">
          <div class="label">Active contracts</div>
          <div class="num">{{ totals.active }}</div>
          <div class="muted small">of {{ totals.engagements }} engagements</div>
        </div>
        <div class="tile" :class="{ attn: totals.awaiting_finance > 0 }">
          <div class="label">Awaiting finance</div>
          <div class="num">{{ totals.awaiting_finance }}</div>
          <div class="muted small">need your review</div>
        </div>
        <div class="tile" :class="{ danger: totals.missed_count > 0 }">
          <div class="label">Missed dues</div>
          <div class="num">{{ usd(totals.missed_amount) }}</div>
          <div class="muted small">
            {{ totals.missed_count }} payment{{ totals.missed_count === 1 ? '' : 's' }}<span v-if="totals.missed_engagements"> · {{ totals.missed_engagements }} client{{ totals.missed_engagements === 1 ? '' : 's' }}</span>
          </div>
        </div>
        <div class="tile">
          <div class="label">Avg / contract</div>
          <div class="num">{{ usd(totals.avg_monthly) }}</div>
          <div class="muted small">{{ totals.total_fleet.toLocaleString() }} vehicles billed</div>
        </div>
      </div>

      <!-- Pipeline -->
      <div class="card pad">
        <h2>Onboarding pipeline</h2>
        <div class="funnel">
          <div v-for="s in funnel" :key="s.key" class="stage">
            <div class="stage-top"><span class="stage-label">{{ s.label }}</span><span class="stage-count">{{ s.count }}</span></div>
            <div class="track"><div class="fill" :class="s.key" :style="{ width: (s.count / funnelMax) * 100 + '%' }" /></div>
          </div>
        </div>
      </div>

      <!-- Per-engagement dues -->
      <div class="card">
        <div class="pad" style="padding-bottom: 0"><h2>Engagements</h2></div>
        <div class="twrap">
          <table>
            <thead>
              <tr><th>Engagement</th><th>Status</th><th class="r">Fleet</th><th class="r">Monthly dues</th><th class="r">Annualized</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.engagement_id">
                <td>
                  <router-link :to="`/engagements/${r.engagement_id}`" class="ename">{{ r.name }}</router-link>
                  <div class="muted small">{{ r.client_name }}</div>
                  <div v-if="r.overdue_count" class="odue">⚠ {{ r.overdue_count }} overdue · {{ usd(r.overdue_amount, 2) }}</div>
                </td>
                <td><StatusPill :status="r.status" /></td>
                <td class="r">{{ r.fleet_size?.toLocaleString() ?? '—' }}</td>
                <td class="r mono">{{ r.monthly_recurring != null ? usd(r.monthly_recurring, 2) : '—' }}</td>
                <td class="r mono muted">{{ r.annualized != null ? usd(r.annualized) : '—' }}</td>
              </tr>
              <tr v-if="!rows.length"><td colspan="5" class="muted" style="padding: 18px">No engagements yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 1040px; margin: 0 auto; padding: 32px; }
.head { margin-bottom: 22px; }
.err { color: var(--risk); background: var(--risk-weak); padding: 10px 14px; border-radius: 10px; }
.small { font-size: 12px; }
.tiles { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr; gap: 14px; margin-bottom: 18px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; }
.tile.hero { border-left: 3px solid var(--accent); }
.tile.attn { border-left: 3px solid var(--warn); }
.tile.danger { border-left: 3px solid var(--risk); }
.odue { color: var(--risk); font-size: 12px; font-weight: 600; margin-top: 4px; }
.label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
.big { font-family: var(--serif); font-size: 34px; font-weight: 600; margin: 6px 0 2px; line-height: 1; }
.per { font-family: var(--sans); font-size: 16px; color: var(--muted); margin-left: 4px; }
.num { font-family: var(--serif); font-size: 30px; font-weight: 600; margin: 6px 0 2px; }
.pad { padding: 20px 22px; }
.card { margin-bottom: 18px; }
.funnel { display: grid; gap: 12px; margin-top: 6px; }
.stage-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; }
.stage-label { color: var(--ink-soft); font-weight: 500; }
.stage-count { font-weight: 700; }
.track { height: 10px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; background: var(--accent); transition: width 0.3s; min-width: 2px; }
.fill.active { background: var(--ok); }
.fill.finance { background: var(--warn); }
.fill.billing { background: var(--accent-ink); }
.twrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 12px 22px; border-top: 1px solid var(--line); font-size: 14px; vertical-align: top; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
.r { text-align: right; }
.mono { font-variant-numeric: tabular-nums; }
.ename { font-weight: 600; color: var(--ink); }
.ename:hover { color: var(--accent-ink); }
@media (max-width: 820px) { .tiles { grid-template-columns: 1fr 1fr; } }
</style>
