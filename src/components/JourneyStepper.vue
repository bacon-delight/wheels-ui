<script setup>
import { computed } from 'vue'

const props = defineProps({ status: { type: String, default: '' } })

const STEPS = [
  { label: 'Draft', sub: 'Upload agreements' },
  { label: 'Extraction', sub: 'AI reads terms' },
  { label: 'Underwriting', sub: 'Analyst review' },
  { label: 'Client approval', sub: 'Client signs off' },
  { label: 'Finance approval', sub: 'Finance validates' },
  { label: 'Billing', sub: 'Config generated' },
]

const STEP_OF = {
  DRAFT: 0,
  EXTRACTING: 1, REVALIDATING: 1,
  IN_UNDERWRITING: 2, VALIDATION_FAILED: 2, CHANGES_REQUESTED_FINANCE: 2,
  PENDING_CLIENT_APPROVAL: 3, CHANGES_REQUESTED_CLIENT: 3,
  CLIENT_APPROVED: 4, PENDING_FINANCE_APPROVAL: 4,
  FINANCE_APPROVED: 5, BILLING_SETUP: 5,
  ACTIVE: 6,
}
const ATTENTION = ['CHANGES_REQUESTED_CLIENT', 'CHANGES_REQUESTED_FINANCE', 'VALIDATION_FAILED']

const current = computed(() => STEP_OF[props.status] ?? 0)
const attention = computed(() => ATTENTION.includes(props.status))

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
.step { position: relative; flex: 1; min-width: 120px; display: flex; flex-direction: column; align-items: center; text-align: center; }
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
