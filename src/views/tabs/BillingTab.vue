<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../../services/api'
import { feeLine, money, prettyService, useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eng = useEngagementStore()
const billing = ref(null)
const fleet = ref(100)

async function loadBilling() {
  try {
    billing.value = (await api.get(`/engagements/${route.params.eid}/billing`)).data
  } catch {
    billing.value = null
  }
}
onMounted(loadBilling)

const config = computed(() => billing.value?.config)
const active = computed(() => ['BILLING_SETUP', 'ACTIVE'].includes(eng.status))

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
            <div class="muted small">Recurring per-vehicle fees for a fleet of {{ fleet }} vehicles. Usage &amp; pass-through charges bill separately.</div>
          </div>
          <label class="fleet"><span class="label">Fleet size</span><input type="number" v-model.number="fleet" min="1" /></label>
        </div>
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
.fleet { display: flex; flex-direction: column; gap: 6px; width: 120px; }
.line { padding: 10px 0; border-bottom: 1px solid var(--line); }
.line:last-child { border-bottom: none; }
.fees { margin: 4px 0 0; padding-left: 18px; }
.fees .val { font-weight: 600; }
.tiers { margin: 2px 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
.excl { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
</style>
