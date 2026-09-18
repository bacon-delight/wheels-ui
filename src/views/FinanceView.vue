<script setup>
import { computed, onMounted, ref } from 'vue'

import StatusPill from '../components/StatusPill.vue'
import { api } from '../services/api'

// Two-series categorical pair, validated for colour-vision deficiency separation
// (deutan ΔE 24.9, tritan 14.1) against the light chart surface.
const C_BILLED = '#1d5cb0'
const C_COLLECTED = '#14a06a'

const data = ref(null)
const loading = ref(true)
const err = ref('')
const hover = ref(null)

const usd = (n, dp = 0) =>
  n == null ? '—' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp })}`
const compact = (n) =>
  n == null ? '—' : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`

const totals = computed(() => data.value?.totals || {})
const funnel = computed(() => data.value?.funnel || [])
const topCustomers = computed(() => (data.value?.top_customers || []).slice(0, 10))
const topEngagements = computed(() => (data.value?.top_engagements || []).slice(0, 10))
const atRisk = computed(() => data.value?.at_risk_customers || [])
const aging = computed(() => data.value?.aging || [])
const trend = computed(() => data.value?.revenue_trend || [])
const recent = computed(() => (data.value?.recent_engagements || []).slice(0, 5))
const expiring = computed(() => (data.value?.expiring_contracts || []).slice(0, 8))
const expiryBuckets = computed(() => data.value?.expiry_buckets || [])
const expiryTotal = computed(() => expiryBuckets.value.reduce((n, b) => n + b.count, 0))

const expiryLabel = (days) => {
  if (days < 0) return `expired ${Math.abs(days)}d ago`
  if (days === 0) return 'expires today'
  return `${days}d left`
}
const expiryClass = (days) => (days < 0 ? 'risk' : days <= 30 ? 'risk' : days <= 90 ? 'warn' : 'ok')
const shortDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

const funnelMax = computed(() => Math.max(1, ...funnel.value.map((s) => s.count)))
const custMax = computed(() => Math.max(1, ...topCustomers.value.map((c) => c.monthly_recurring)))
const engMax = computed(() => Math.max(1, ...topEngagements.value.map((e) => e.monthly_recurring || 0)))
const agingTotal = computed(() => aging.value.reduce((n, b) => n + b.amount, 0))

// --- trend chart geometry (inline SVG; no external library) ---
const W = 720
const H = 200
// Value labels ride above their gridline rather than in a left rail, so the plot keeps equal
// gutters on both sides instead of being pushed right by the widest label.
const PAD = { t: 26, r: 8, b: 26, l: 8 }
const plotW = W - PAD.l - PAD.r
const plotH = H - PAD.t - PAD.b
const trendMax = computed(() => Math.max(1, ...trend.value.flatMap((m) => [m.billed, m.collected])))
const xAt = (i) => PAD.l + (trend.value.length < 2 ? plotW / 2 : (i / (trend.value.length - 1)) * plotW)
const yAt = (v) => PAD.t + plotH - (v / trendMax.value) * plotH
const path = (key) => trend.value.map((m, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(m[key]).toFixed(1)}`).join(' ')
const gridLines = computed(() => [0, 0.5, 1].map((f) => ({ f, y: PAD.t + plotH - f * plotH, label: compact(trendMax.value * f) })))
const monthLabel = (m) => {
  const [y, mo] = m.split('-')
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString(undefined, { month: 'short' })
}

function onMove(evt) {
  if (!trend.value.length) return
  const box = evt.currentTarget.getBoundingClientRect()
  const x = ((evt.clientX - box.left) / box.width) * W
  const i = Math.round(((x - PAD.l) / plotW) * (trend.value.length - 1))
  hover.value = Math.min(trend.value.length - 1, Math.max(0, i))
}

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
    <div class="head spread">
      <div>
        <h1>Dashboard</h1>
        <p class="muted" style="margin: 4px 0 0">Recurring revenue, collections and where the book is concentrated.</p>
      </div>
      <button class="ghost sm" :disabled="loading" @click="load">Refresh</button>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-else-if="data">
      <!-- Headline numbers. A KPI row, not a chart: these are single current values. -->
      <div class="tiles">
        <div class="tile hero">
          <div class="label">Monthly recurring</div>
          <div class="big">{{ usd(totals.monthly_recurring) }}<span class="per">/mo</span></div>
          <div class="muted small">{{ usd(totals.annualized) }} annualized</div>
        </div>
        <div class="tile">
          <div class="label">Collected</div>
          <div class="num">{{ usd(totals.collected_amount) }}</div>
          <div class="muted small">{{ totals.collection_rate }}% of billed to date</div>
        </div>
        <div class="tile" :class="{ danger: totals.missed_amount > 0 }">
          <div class="label">Overdue</div>
          <div class="num">{{ usd(totals.missed_amount) }}</div>
          <div class="muted small">{{ totals.missed_count }} payment{{ totals.missed_count === 1 ? '' : 's' }} · {{ totals.missed_engagements }} engagement{{ totals.missed_engagements === 1 ? '' : 's' }}</div>
        </div>
        <div class="tile">
          <div class="label">Customers</div>
          <div class="num">{{ totals.active_customers }}</div>
          <div class="muted small">{{ totals.customers }} total · {{ usd(totals.avg_per_customer) }} avg/mo</div>
        </div>
        <div class="tile" :class="{ attn: totals.awaiting_finance > 0 }">
          <div class="label">Awaiting finance</div>
          <div class="num">{{ totals.awaiting_finance }}</div>
          <div class="muted small">{{ usd(totals.pipeline_value) }}/mo in pipeline</div>
        </div>
        <div class="tile">
          <div class="label">Fleet billed</div>
          <div class="num">{{ (totals.total_fleet || 0).toLocaleString() }}</div>
          <div class="muted small">{{ usd(totals.revenue_per_vehicle, 2) }} per vehicle/mo</div>
        </div>
      </div>

      <!-- Billed vs collected over time. Two series, so a legend plus direct labels. -->
      <div class="card pad">
        <div class="spread">
          <h2 style="margin: 0">Billed vs collected</h2>
          <div class="legend">
            <span class="lg"><i :style="{ background: C_BILLED }" />Billed</span>
            <span class="lg"><i :style="{ background: C_COLLECTED }" />Collected</span>
          </div>
        </div>
        <svg v-if="trend.length" class="chart" :viewBox="`0 0 ${W} ${H}`" role="img"
             aria-label="Amount billed and amount collected by month"
             @mousemove="onMove" @mouseleave="hover = null">
          <g>
            <line v-for="g in gridLines" :key="g.f" :x1="PAD.l" :x2="W - PAD.r" :y1="g.y" :y2="g.y" class="grid" />
            <text v-for="g in gridLines" :key="'t' + g.f" :x="PAD.l" :y="g.y - 6" class="axis">{{ g.label }}</text>
          </g>
          <text v-for="(m, i) in trend" :key="m.month" :x="xAt(i)" :y="H - 8" class="axis mid">{{ monthLabel(m.month) }}</text>
          <path :d="path('billed')" fill="none" :stroke="C_BILLED" stroke-width="2" stroke-linejoin="round" />
          <path :d="path('collected')" fill="none" :stroke="C_COLLECTED" stroke-width="2" stroke-linejoin="round" />
          <template v-if="hover !== null">
            <line :x1="xAt(hover)" :x2="xAt(hover)" :y1="PAD.t" :y2="PAD.t + plotH" class="cross" />
            <circle :cx="xAt(hover)" :cy="yAt(trend[hover].billed)" r="4.5" :fill="C_BILLED" stroke="#fff" stroke-width="2" />
            <circle :cx="xAt(hover)" :cy="yAt(trend[hover].collected)" r="4.5" :fill="C_COLLECTED" stroke="#fff" stroke-width="2" />
          </template>
        </svg>
        <p v-else class="muted">No billing schedules yet.</p>
        <div v-if="hover !== null && trend[hover]" class="tip">
          <strong>{{ trend[hover].month }}</strong>
          <span><i :style="{ background: C_BILLED }" />Billed {{ usd(trend[hover].billed, 2) }}</span>
          <span><i :style="{ background: C_COLLECTED }" />Collected {{ usd(trend[hover].collected, 2) }}</span>
        </div>
      </div>

      <!-- Two tall ranking cards pair with each other; the two short cards pair below, so
           neither row leaves a card stretched over empty space. -->
      <div class="two">
        <!-- Ranking by magnitude: bar length is the encoding, so one hue throughout. -->
        <div class="card pad">
          <div class="spread">
            <h2 style="margin: 0">Top customers by revenue</h2>
            <span class="muted small">Top 5 hold {{ totals.top5_revenue_share }}%</span>
          </div>
          <div class="ranks">
            <div v-for="(c, i) in topCustomers" :key="c.customer_id || c.name" class="rank">
              <div class="rbody">
                <div class="rtop">
                  <span class="rname">
                    <span class="rk">{{ i + 1 }}</span>
                    <router-link v-if="c.customer_id" :to="`/customers/${c.customer_id}`">{{ c.name }}</router-link>
                    <span v-else>{{ c.name }}</span>
                  </span>
                  <strong class="mono">{{ usd(c.monthly_recurring, 2) }}</strong>
                </div>
                <div class="track"><div class="fill" :style="{ width: (c.monthly_recurring / custMax) * 100 + '%' }" /></div>
                <div class="muted small">
                  {{ c.engagements }} engagement{{ c.engagements === 1 ? '' : 's' }} · {{ c.fleet_size }} vehicles · {{ c.revenue_share }}% of book
                  <span v-if="c.overdue_amount" class="odue"> · {{ usd(c.overdue_amount, 2) }} overdue</span>
                </div>
              </div>
            </div>
            <p v-if="!topCustomers.length" class="muted">No revenue on the book yet.</p>
          </div>
        </div>

        <div class="card pad">
          <h2>Top engagements</h2>
          <div class="ranks">
            <div v-for="(e, i) in topEngagements" :key="e.engagement_id" class="rank">
              <div class="rbody">
                <div class="rtop">
                  <span class="rname">
                    <span class="rk">{{ i + 1 }}</span>
                    <router-link :to="`/engagements/${e.engagement_id}`">{{ e.name }}</router-link>
                  </span>
                  <strong class="mono">{{ usd(e.monthly_recurring, 2) }}</strong>
                </div>
                <div class="track"><div class="fill alt" :style="{ width: ((e.monthly_recurring || 0) / engMax) * 100 + '%' }" /></div>
                <div class="muted small">{{ e.customer_name }} · {{ e.fleet_size }} vehicles</div>
              </div>
            </div>
            <p v-if="!topEngagements.length" class="muted">No active engagements yet.</p>
          </div>
        </div>
      </div>

      <!-- Contract expiry: what is up for renewal, and what revenue rides on it. -->
      <div class="card pad">
        <div class="spread">
          <h2 style="margin: 0">Contract expiry</h2>
          <span class="muted small">
            {{ totals.expiring_90d }} within 90 days · {{ usd(totals.expiring_90d_value, 2) }}/mo at renewal
          </span>
        </div>
        <div v-if="expiryTotal" class="agebar" style="margin-top: 16px">
          <div v-for="b in expiryBuckets" :key="b.key" v-show="b.count > 0" class="seg" :class="'x_' + b.key"
               :style="{ width: (b.count / expiryTotal) * 100 + '%' }" :title="`${b.label}: ${b.count}`" />
        </div>
        <div class="row bands">
          <span v-for="b in expiryBuckets" :key="b.key" v-show="b.count > 0" class="legchip">
            <i :class="'x_' + b.key" /> {{ b.label }} · {{ b.count }}
          </span>
        </div>
        <table v-if="expiring.length" class="mini wide">
          <thead><tr><th>Engagement</th><th>Customer</th><th>Expires</th><th class="r">Monthly</th><th class="r">Term</th></tr></thead>
          <tbody>
            <tr v-for="e in expiring" :key="e.engagement_id">
              <td><router-link :to="`/engagements/${e.engagement_id}`" class="ename">{{ e.name }}</router-link></td>
              <td class="muted">{{ e.customer_name }}</td>
              <td>
                {{ shortDate(e.contract_end) }}
                <span class="badge" :class="expiryClass(e.days_to_expiry)"><span class="dot" />{{ expiryLabel(e.days_to_expiry) }}</span>
                <span v-if="e.auto_renew" class="pill role">auto-renews</span>
              </td>
              <td class="r mono">{{ usd(e.monthly_recurring, 2) }}</td>
              <td class="r muted">{{ e.contract_term_months ? e.contract_term_months + ' mo' : '—' }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted" style="margin-top: 12px">No contract end dates recorded yet.</p>
      </div>

      <div class="two">
        <!-- Receivables aging: these are states, so the reserved status ramp applies. -->
        <div class="card pad">
          <h2>Receivables aging</h2>
          <div v-if="agingTotal" class="agebar">
            <div v-for="b in aging" :key="b.key" v-show="b.amount > 0" class="seg" :class="b.key"
                 :style="{ width: (b.amount / agingTotal) * 100 + '%' }" :title="`${b.label}: ${usd(b.amount, 2)}`" />
          </div>
          <table class="mini">
            <tbody>
              <tr v-for="b in aging" :key="b.key">
                <td><span class="swatch" :class="b.key" />{{ b.label }}</td>
                <td class="r muted">{{ b.count }}</td>
                <td class="r mono">{{ usd(b.amount, 2) }}</td>
              </tr>
            </tbody>
          </table>

          <template v-if="atRisk.length">
            <h2 style="margin-top: 22px">At risk</h2>
            <div v-for="c in atRisk.slice(0, 5)" :key="c.customer_id || c.name" class="riskrow">
              <router-link v-if="c.customer_id" :to="`/customers/${c.customer_id}`">{{ c.name }}</router-link>
              <span v-else>{{ c.name }}</span>
              <strong class="mono odue">{{ usd(c.overdue_amount, 2) }}</strong>
            </div>
          </template>
        </div>

        <div class="card pad">
          <h2>Onboarding pipeline</h2>
          <div class="funnel">
            <div v-for="s in funnel" :key="s.key" class="stage">
              <div class="stage-top">
                <span class="stage-label">{{ s.label }}</span>
                <span><span class="muted small mono" style="margin-right: 8px">{{ s.value ? usd(s.value, 0) + '/mo' : '' }}</span><span class="stage-count">{{ s.count }}</span></span>
              </div>
              <div class="track"><div class="fill" :class="s.key" :style="{ width: (s.count / funnelMax) * 100 + '%' }" /></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="pad spread" style="padding-bottom: 0">
          <h2 style="margin: 0">Recent engagements</h2>
          <router-link to="/engagements" class="muted small">See all →</router-link>
        </div>
        <div class="twrap">
          <table>
            <thead>
              <tr><th>Engagement</th><th>Customer</th><th>Status</th><th class="r">Fleet</th><th class="r">Monthly</th><th class="r">Collected</th><th class="r">Overdue</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in recent" :key="r.engagement_id">
                <td><router-link :to="`/engagements/${r.engagement_id}`" class="ename">{{ r.name }}</router-link></td>
                <td>
                  <router-link v-if="r.customer_id" :to="`/customers/${r.customer_id}`" class="muted">{{ r.customer_name }}</router-link>
                  <span v-else class="muted">{{ r.customer_name }}</span>
                </td>
                <td><StatusPill :status="r.status" /></td>
                <td class="r">{{ r.fleet_size?.toLocaleString() ?? '—' }}</td>
                <td class="r mono">{{ r.monthly_recurring != null ? usd(r.monthly_recurring, 2) : '—' }}</td>
                <td class="r mono muted">{{ usd(r.collected_amount, 2) }}</td>
                <td class="r mono" :class="{ odue: r.overdue_amount > 0 }">{{ r.overdue_amount ? usd(r.overdue_amount, 2) : '—' }}</td>
              </tr>
              <tr v-if="!recent.length"><td colspan="7" class="muted" style="padding: 18px">No engagements yet.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 1680px; margin: 0 auto; padding: 32px; }
.head { margin-bottom: 22px; align-items: flex-start; }
.head h1 { margin: 0; }
.err { color: var(--risk); background: var(--risk-weak); padding: 10px 14px; border-radius: 10px; }
.small { font-size: 12px; }
.mono { font-variant-numeric: tabular-nums; }
.r { text-align: right; }
.odue { color: var(--risk); font-weight: 600; }

.tiles { display: grid; grid-template-columns: 1.4fr repeat(5, 1fr); gap: 12px; margin-bottom: 18px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; }
.tile.hero { border-left: 3px solid var(--accent); }
.tile.attn { border-left: 3px solid var(--warn); }
.tile.danger { border-left: 3px solid var(--risk); }
.label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
.big { font-family: var(--serif); font-size: 32px; font-weight: 600; margin: 6px 0 2px; line-height: 1; }
.per { font-family: var(--sans); font-size: 15px; color: var(--muted); margin-left: 4px; }
.num { font-family: var(--serif); font-size: 26px; font-weight: 600; margin: 6px 0 2px; line-height: 1.1; }

.card { margin-bottom: 18px; }
.pad { padding: 20px 22px; }
/* Cards size to their content. Forcing equal heights put dead space under whichever card had
   less to say; the min-height only guards the empty state. */
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; margin-bottom: 18px; }
.two > .card { margin-bottom: 0; min-height: 220px; }

.legend { display: flex; gap: 14px; font-size: 12px; color: var(--ink-soft); }
.lg { display: inline-flex; align-items: center; gap: 6px; }
.lg i, .tip i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.chart { width: 100%; height: auto; margin-top: 12px; display: block; }
.grid { stroke: var(--line); stroke-width: 1; }
.cross { stroke: var(--line-strong); stroke-width: 1; stroke-dasharray: 3 3; }
.axis { font-size: 10px; fill: var(--muted); }
.axis.mid { text-anchor: middle; }
.tip { display: flex; gap: 16px; align-items: center; font-size: 12px; margin-top: 8px; color: var(--ink-soft); }
.tip span { display: inline-flex; align-items: center; gap: 6px; }

.ranks { display: flex; flex-direction: column; gap: 14px; margin-top: 14px; justify-content: flex-start; }
.ranks > .muted { margin: 8px 0; color: var(--muted); }
.rank { display: block; }
.rk { font-size: 12px; font-weight: 700; color: var(--muted); margin-right: 8px; font-variant-numeric: tabular-nums; }
.rbody { min-width: 0; }
.rtop { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; margin-bottom: 5px; align-items: baseline; }
.rname { font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.rname a { color: inherit; }
.rname a:hover { color: var(--accent-ink); }
.rname:hover { color: var(--accent-ink); }
.track { height: 8px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; background: #1d5cb0; min-width: 2px; }
.fill.alt { background: #4a86d4; }
.fill.active { background: var(--ok); }
.fill.finance { background: var(--warn); }
.fill.billing { background: var(--accent-ink); }

.agebar { display: flex; gap: 2px; height: 14px; border-radius: 999px; overflow: hidden; margin: 14px 0 12px; background: var(--line); }
.seg { height: 100%; }
.swatch { width: 9px; height: 9px; border-radius: 2px; display: inline-block; margin-right: 7px; }
.seg.current, .swatch.current { background: #14a06a; }
.seg.d1_30, .swatch.d1_30 { background: #c9a227; }
.seg.d31_60, .swatch.d31_60 { background: #d97a29; }
.seg.d61_90, .swatch.d61_90 { background: #c9512f; }
.seg.d90_plus, .swatch.d90_plus { background: #a32d2d; }
.seg.x_expired, .legchip i.x_expired { background: #a32d2d; }
.seg.x_d30, .legchip i.x_d30 { background: #c9512f; }
.seg.x_d60, .legchip i.x_d60 { background: #d97a29; }
.seg.x_d90, .legchip i.x_d90 { background: #c9a227; }
.seg.x_d180, .legchip i.x_d180 { background: #4a86d4; }
.seg.x_later, .legchip i.x_later { background: #14a06a; }
.legchip { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-soft); }
.legchip i { width: 9px; height: 9px; border-radius: 2px; display: inline-block; }
.bands { gap: 14px; flex-wrap: wrap; margin: 12px 0 4px; }
.mini.wide { margin-top: 10px; }
.mini.wide th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; padding: 6px 10px 6px 0; }
.mini.wide td { padding: 9px 10px 9px 0; }
.pill.role { background: #e9eef6; color: var(--muted); font-size: 11px; padding: 2px 8px; border-radius: 999px; margin-left: 6px; }
.mini { width: 100%; border-collapse: collapse; font-size: 13px; }
.mini td { vertical-align: middle; }
.mini td { padding: 6px 0; border-top: 1px solid var(--line); }
.riskrow { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--line); font-size: 13px; }

/* align-content: start so the rows keep their natural spacing instead of distributing
   themselves down whatever height the card happens to have. */
.funnel { display: grid; gap: 14px; margin-top: 14px; align-content: start; }
.stage-top { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 5px; }
.stage-label { color: var(--ink-soft); font-weight: 500; }
.stage-count { font-weight: 700; }

.twrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 11px 22px; border-top: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
.ename { font-weight: 600; color: var(--ink); }
.ename:hover { color: var(--accent-ink); }
@media (max-width: 1000px) { .tiles { grid-template-columns: repeat(3, 1fr); } .two { grid-template-columns: 1fr; } }
@media (max-width: 640px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
</style>
