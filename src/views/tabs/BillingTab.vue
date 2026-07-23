<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../../services/api'
import { feeLine, money, prettyService, useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eng = useEngagementStore()
const billing = ref(null)
const fleet = ref(100)
const saving = ref(false)
const paying = ref(null)
const reminding = ref(null)
const notice = ref('')

async function loadBilling() {
  try {
    billing.value = (await api.get(`/engagements/${route.params.eid}/billing`)).data
    fleet.value = billing.value?.fleet_size ?? 100
  } catch {
    billing.value = null
  }
}
onMounted(loadBilling)

// Provider adjusts the fleet size -> persist it + recompute dues (reload reflows the schedule).
async function saveFleet() {
  const f = Math.max(1, Number(fleet.value) || 1)
  fleet.value = f
  saving.value = true
  try {
    await api.patch(`/engagements/${route.params.eid}/billing`, { fleet_size: f })
    await loadBilling()
  } catch {
    /* leave the local estimate; server will reconcile on next load */
  }
  saving.value = false
}

const config = computed(() => billing.value?.config)
const active = computed(() => ['BILLING_SETUP', 'ACTIVE'].includes(eng.status))
const schedule = computed(() => billing.value?.schedule || [])
const summary = computed(() => billing.value?.summary || {})
const FREQ = { monthly: 'Monthly', quarterly: 'Quarterly', annual: 'Annual' }
const BILLED = { monthly: 'monthly', quarterly: 'quarterly', annual: 'annually' }
const MONTHS = { monthly: 1, quarterly: 3, annual: 12 }
const months = computed(() => MONTHS[billing.value?.frequency] || 1)
const perInstallment = computed(() => estMonthly.value * months.value)
const STATUS = {
  paid: { label: 'Paid', cls: 'ok' },
  due: { label: 'Due now', cls: 'due' },
  overdue: { label: 'Overdue', cls: 'risk' },
  upcoming: { label: 'Upcoming', cls: 'soon' },
}
const fmtDate = (iso) =>
  new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

async function payNow(row) {
  paying.value = row.seq
  notice.value = ''
  try {
    await api.post(`/engagements/${route.params.eid}/payments/${row.seq}:pay`)
    await loadBilling()
    notice.value = `Payment recorded for ${row.label}.`
  } catch (e) {
    notice.value = e.response?.data?.detail || e.message
  }
  paying.value = null
}
async function remind(row) {
  reminding.value = row.seq
  notice.value = ''
  try {
    await api.post(`/engagements/${route.params.eid}/payments/${row.seq}:remind`)
    notice.value = `Reminder emailed to the client for ${row.label}.`
  } catch (e) {
    notice.value = e.response?.data?.detail || e.message
  }
  reminding.value = null
}

const monthlyPerUnit = (fi) => fi.amount != null && /per_(vehicle|unit).*(month)/.test(fi.unit_basis || '')

// Rough recurring estimate: per-vehicle-per-month flat fees + the applicable bundled tier, × fleet.
const estMonthly = computed(() => {
  if (!config.value) return 0
  let perUnit = 0
  for (const sl of config.value.service_lines || []) {
    for (const fi of sl.fee_items || []) {
      if (monthlyPerUnit(fi)) perUnit += fi.amount
      const band = (fi.tier_bands || []).find(
        (t) => fleet.value >= t.min_units && (t.max_units == null || fleet.value <= t.max_units),
      )
      if (band?.amount != null) perUnit += band.amount
    }
  }
  return perUnit * fleet.value
})

async function setupBilling() {
  await eng.action('setup-billing')
  await loadBilling()
}
</script>

<template>
  <div class="stack">
    <!-- Provider: run setup -->
    <div v-if="eng.isProvider && eng.status === 'FINANCE_APPROVED'" class="card pad">
      <h2>Set up billing</h2>
      <p class="muted">
        Generate the billing configuration automatically from the approved terms — no manual keying.
      </p>
      <button class="primary" :disabled="!!eng.busy" @click="setupBilling">
        {{ eng.busy === 'setup-billing' ? 'Generating…' : 'Generate billing configuration' }}
      </button>
    </div>

    <!-- Not configured yet -->
    <div v-else-if="!active" class="card pad">
      <h2>Billing</h2>
      <p class="muted" style="margin: 0">
        Billing will be configured once the terms are fully approved. Nothing to show yet.
      </p>
    </div>

    <!-- Configured: schedule + dues -->
    <template v-else-if="config">
      <div class="card pad est">
        <div class="spread" style="align-items: flex-start">
          <div>
            <div class="label">Estimated monthly recurring</div>
            <div class="big">{{ money(estMonthly) }}<span class="muted per">/mo</span></div>
            <div v-if="active && months > 1" class="billed">Billed {{ BILLED[billing.frequency] }} · <strong>{{ money(perInstallment) }}</strong> per installment ({{ months }} × monthly)</div>
            <div class="muted small">Recurring per-vehicle fees for a fleet of {{ fleet }} vehicles. Usage &amp; pass-through charges bill separately.</div>
          </div>
          <label class="fleet" v-if="eng.isProvider">
            <span class="label">Fleet size {{ saving ? '· saving…' : '' }}</span>
            <input type="number" v-model.number="fleet" min="1" @change="saveFleet" />
          </label>
          <div class="fleet" v-else><span class="label">Fleet size</span><div class="fleetval">{{ fleet }}</div></div>
        </div>
      </div>

      <!-- Payment schedule -->
      <div class="card pad" v-if="schedule.length">
        <div class="spread" style="margin-bottom: 4px">
          <h2 style="margin: 0">Payment schedule</h2>
          <span class="muted small">
            {{ summary.paid_count || 0 }} paid<span v-if="summary.overdue_count"> · <span class="risktext">{{ summary.overdue_count }} overdue</span></span>
          </span>
        </div>
        <p class="muted small" style="margin: 0 0 12px">
          {{ FREQ[billing.frequency] || 'Monthly' }} billing<span v-if="months > 1"> — each installment covers {{ months }} months ({{ months }} × {{ money(estMonthly) }}/mo)</span>.
          <template v-if="eng.isProvider">Track payments and remind the client of any missed dues.</template>
          <template v-else>Pay each installment on its due date, or pay the next one early.</template>
        </p>
        <div class="twrap">
          <table class="sched">
            <thead><tr><th>Payment</th><th>Due date</th><th class="r">Amount</th><th>Status</th><th class="r">Action</th></tr></thead>
            <tbody>
              <tr v-for="row in schedule" :key="row.seq" :class="{ over: row.status === 'overdue' }">
                <td><strong>{{ row.label }}</strong><span v-if="row.kind === 'initial'" class="tag">Initial</span></td>
                <td class="muted">{{ fmtDate(row.due_date) }}</td>
                <td class="r mono">{{ money(row.amount) }}</td>
                <td><span class="st" :class="STATUS[row.status].cls">{{ row.status === 'upcoming' && row.pay_early ? 'Next up' : STATUS[row.status].label }}</span></td>
                <td class="r">
                  <template v-if="!eng.isProvider">
                    <span v-if="row.status === 'paid'" class="muted small">✓ {{ row.paid_at ? fmtDate(row.paid_at) : 'paid' }}</span>
                    <button v-else-if="row.payable" class="sm" :class="{ primary: row.status !== 'upcoming' }" :disabled="paying === row.seq" @click="payNow(row)">
                      {{ paying === row.seq ? 'Paying…' : row.pay_early ? 'Pay early' : 'Pay now' }}
                    </button>
                    <span v-else class="muted small">—</span>
                  </template>
                  <template v-else>
                    <span v-if="row.status === 'paid'" class="muted small">by {{ row.paid_by || 'client' }}</span>
                    <button v-else-if="row.status === 'overdue' || row.status === 'due'" class="sm" :disabled="reminding === row.seq" @click="remind(row)">
                      {{ reminding === row.seq ? 'Sending…' : 'Send reminder' }}
                    </button>
                    <span v-else class="muted small">—</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="notice" class="notice">{{ notice }}</p>
      </div>

      <div class="card pad">
        <div class="spread" style="margin-bottom: 6px">
          <h2 style="margin: 0">Billing configuration</h2>
          <span class="badge ok">Generated · no manual keying</span>
        </div>
        <p class="muted small" v-if="billing.signature">
          Approved &amp; e-signed by <strong>{{ billing.signature.full_name }}</strong>
          <span v-if="billing.signature.place"> · {{ billing.signature.place }}</span>
          <span v-if="billing.signature.signed_at"> · {{ new Date(billing.signature.signed_at).toLocaleDateString() }}</span>
        </p>

        <div v-for="(sl, i) in config.service_lines" :key="i" class="line">
          <strong>{{ prettyService(sl.service) }}</strong>
          <ul class="fees">
            <li v-for="(fi, j) in sl.fee_items" :key="j">
              <span v-if="feeLine(fi)" class="val">{{ feeLine(fi) }}</span>
              <span v-if="fi.description" class="muted"> {{ feeLine(fi) ? '— ' : '' }}{{ fi.description }}</span>
              <ul v-if="fi.tier_bands?.length" class="tiers"><li v-for="(t, k) in fi.tier_bands" :key="k">units {{ t.min_units }}–{{ t.max_units ?? '∞' }}: {{ money(t.amount) }}</li></ul>
            </li>
          </ul>
        </div>

        <div v-if="config.lease_terms" class="line">
          <strong>Vehicle lease</strong>
          <ul class="fees">
            <li v-if="config.lease_terms.admin_fee">Admin fee: {{ money(config.lease_terms.admin_fee.amount) }} · {{ (config.lease_terms.admin_fee.unit_basis || '').replace(/_/g, ' ') }}</li>
            <li v-if="config.lease_terms.rate">Lease charge: {{ config.lease_terms.rate.basis === 'fixed' ? config.lease_terms.rate.fixed_rate_pct + '% p.a.' : (config.lease_terms.rate.index || '') + ' + ' + config.lease_terms.rate.spread_bps + ' bps' }}</li>
          </ul>
        </div>

        <div v-if="config.excluded_services?.length" class="excl">
          <span class="label">Not billed</span>
          <span class="muted"> {{ config.excluded_services.map(prettyService).join(', ') }}</span>
        </div>
      </div>
    </template>

    <div v-else class="card pad"><p class="muted" style="margin: 0">Billing configuration is being generated…</p></div>
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.est { border-left: 3px solid var(--accent); }
.big { font-family: var(--serif); font-size: 32px; font-weight: 600; margin: 4px 0; }
.per { font-size: 16px; font-family: var(--sans); margin-left: 4px; }
.billed { font-size: 13px; color: var(--accent-ink); margin: 2px 0 6px; }
.fleet { display: flex; flex-direction: column; gap: 6px; width: 120px; }
.fleetval { font-family: var(--serif); font-size: 22px; font-weight: 600; padding: 4px 0; }
.line { padding: 10px 0; border-bottom: 1px solid var(--line); }
.line:last-child { border-bottom: none; }
.fees { margin: 4px 0 0; padding-left: 18px; }
.fees .val { font-weight: 600; }
.tiers { margin: 2px 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
.excl { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.twrap { overflow-x: auto; }
.sched { width: 100%; border-collapse: collapse; }
.sched th, .sched td { text-align: left; padding: 11px 12px; border-top: 1px solid var(--line); font-size: 14px; }
.sched th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
.sched tr.over td { background: var(--risk-weak); }
.sched .r { text-align: right; }
.sched .mono { font-variant-numeric: tabular-nums; }
.tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--accent-ink); background: var(--accent-weak); padding: 1px 6px; border-radius: 5px; margin-left: 8px; vertical-align: middle; }
.st { font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.st.ok { background: var(--ok-weak); color: var(--ok); }
.st.due { background: var(--accent-weak); color: var(--accent-ink); }
.st.risk { background: var(--risk-weak); color: var(--risk); }
.st.soon { background: #efece6; color: var(--muted); }
.risktext { color: var(--risk); font-weight: 600; }
button.sm { padding: 5px 12px; font-size: 13px; border-radius: 8px; }
.notice { color: var(--ok); background: var(--ok-weak); padding: 9px 13px; border-radius: 9px; margin: 12px 0 0; font-size: 13px; }
</style>
