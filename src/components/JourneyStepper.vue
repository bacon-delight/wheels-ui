<script setup>
import { computed } from 'vue'

import { ALL_STAGES } from '../stores/lifecycle'

const props = defineProps({
  // Which of the five steps the engagement stands in. The API decides this — it owns the
  // statuses and the mapping — so the stepper never has to keep a second copy of that table.
  stage: { type: String, default: '' },
  // Still needed for the one thing a stage cannot say: whether somebody is being waited on.
  status: { type: String, default: '' },
  // A customer is a party to the contract, not a user of the workflow. How Wheels arrives at
  // the terms — extraction, underwriting, the billing audit — is not their journey, so they
  // get one drawn from their own vantage point.
  forCustomer: { type: Boolean, default: false },
})

const PROVIDER_SUBS = {
  NEGOTIATIONS: 'Agreed offline',
  ONBOARDING: 'Agreements read',
  REVIEW: 'Customer signs',
  BILLING_SETUP: 'Generated automatically',
  BILLING_AUDIT: 'Checked before go-live',
  ACTIVE: 'Billing has started',
}
const PROVIDER_STEPS = ALL_STAGES.map((st) => ({ label: st.label, sub: PROVIDER_SUBS[st.key] }))
const PROVIDER_STEP_OF = Object.fromEntries(ALL_STAGES.map((st, i) => [st.key, i]))

const CUSTOMER_STEPS = [
  { label: 'Preparing', sub: 'Wheels drafts your terms' },
  { label: 'Your review', sub: 'You approve or ask for changes' },
  { label: 'Finalising', sub: 'Wheels completes setup' },
  { label: 'Active', sub: 'Billing has started' },
]
// Everything before the terms reach the customer is one step to them: Wheels is working on it.
// Everything after they sign is another: Wheels is finishing up.
const CUSTOMER_STEP_OF = {
  NEGOTIATIONS: 0, ONBOARDING: 0,
  REVIEW: 1,
  BILLING_SETUP: 2, BILLING_AUDIT: 2,
  ACTIVE: 3,
}
// A change asked for in the billing audit is internal, so it is not something a customer is
// alerted to.
const PROVIDER_ATTENTION = [
  'CHANGES_REQUESTED_CLIENT', 'CHANGES_REQUESTED_AUDIT', 'VALIDATION_FAILED',
]
const CUSTOMER_ATTENTION = ['CHANGES_REQUESTED_CLIENT']

const STEPS = computed(() => (props.forCustomer ? CUSTOMER_STEPS : PROVIDER_STEPS))
const ATTENTION = computed(() =>
  props.forCustomer ? CUSTOMER_ATTENTION : PROVIDER_ATTENTION,
)
const current = computed(() =>
  (props.forCustomer ? CUSTOMER_STEP_OF : PROVIDER_STEP_OF)[props.stage] ?? 0,
)
const attention = computed(() => ATTENTION.value.includes(props.status))

function stateOf(i) {
  if (i < current.value) return 'done'
  if (i === current.value) return attention.value ? 'attn' : 'active'
  return 'todo'
}
</script>

<template>
  <div class="stepper">
    <div v-for="(s, i) in STEPS" :key="i" class="step" :class="stateOf(i)">
      <div class="track" v-if="i > 0" :class="{ fill: i <= current }" />
      <div class="node">
        <span v-if="stateOf(i) === 'done'">✓</span>
        <span v-else-if="stateOf(i) === 'attn'">!</span>
        <span v-else>{{ i + 1 }}</span>
      </div>
      <div class="lbl">
        <div class="t">{{ s.label }}</div>
        <div class="sub">{{ s.sub }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stepper { display: flex; gap: 0; overflow-x: auto; padding: 6px 2px 2px; }
.step { position: relative; flex: 1; min-width: 108px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.track { position: absolute; top: 15px; right: 50%; width: 100%; height: 2px; background: var(--line-strong); }
.track.fill { background: var(--accent); }
.node {
  position: relative; z-index: 1;
  width: 32px; height: 32px; border-radius: 999px;
  display: grid; place-items: center; font-size: 13px; font-weight: 700;
  background: var(--panel); border: 2px solid var(--line-strong); color: var(--muted);
}
.step.done .node { background: var(--accent); border-color: var(--accent); color: #fff; }
.step.active .node { border-color: var(--accent); color: var(--accent-ink); box-shadow: 0 0 0 4px var(--accent-weak); }
.step.attn .node { border-color: var(--warn); color: var(--warn); background: var(--warn-weak); box-shadow: 0 0 0 4px var(--warn-weak); }
.lbl { margin-top: 8px; }
.lbl .t { font-size: 13px; font-weight: 600; }
.step.todo .lbl .t { color: var(--muted); font-weight: 500; }
.lbl .sub { font-size: 11px; color: var(--muted); margin-top: 1px; }
</style>
