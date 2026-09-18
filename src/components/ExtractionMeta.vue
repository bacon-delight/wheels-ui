<script setup>
import { computed, ref } from 'vue'

// What an extraction run cost, tucked beside the document it produced. Unobtrusive at a
// glance, complete on hover — and the only place a truncated call or a prompt cache that
// quietly stopped working becomes visible to a person.
const props = defineProps({
  run: { type: Object, default: null },
  // Which edge the panel hangs from. A chip near the left of the page must open rightward or
  // it disappears under the sidebar.
  align: { type: String, default: 'left' },
})

const open = ref(false)
const CALL_LABELS = {
  pricing: 'Pricing',
  sla: 'SLA',
  reporting: 'Reporting',
  definitions: 'Definitions',
  misc_reference: 'Reference',
  misc_operational: 'Obligations',
}

const k = (n) => (n == null ? '—' : n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n))
const money = (n) => (n == null ? '—' : `$${n < 0.01 ? n.toFixed(4) : n.toFixed(2)}`)

const chip = computed(() => {
  const r = props.run
  if (!r) return null
  return `${k((r.input_tokens || 0) + (r.cache_read_tokens || 0))} → ${k(r.output_tokens)} · ${money(r.cost_usd)}`
})
const cacheSaving = computed(() => {
  const r = props.run
  if (!r?.uncached_cost_usd || !r?.cost_usd) return null
  const saved = r.uncached_cost_usd - r.cost_usd
  return saved > 0.001 ? saved : null
})
// A category cut off at its limit returned a fragment of the truth. Worth saying loudly,
// because it looks identical to a contract that simply said less.
const trouble = computed(() =>
  [...(props.run?.truncated_calls || []), ...(props.run?.failed_calls || [])],
)
const seconds = computed(() =>
  props.run?.duration_ms ? Math.round(props.run.duration_ms / 1000) : null,
)
</script>

<template>
  <span
    v-if="chip"
    class="meta"
    :class="{ bad: trouble.length }"
    tabindex="0"
    role="button"
    :aria-label="`Extraction run details: ${chip}`"
    @mouseenter="open = true"
    @mouseleave="open = false"
    @focus="open = true"
    @blur="open = false"
    @click="open = !open"
  >
    <span class="chiptext">{{ chip }}</span>
    <span v-if="trouble.length" class="warn-dot" title="a category was cut short">!</span>

    <span v-if="open" class="panel" :class="align === 'right' ? 'anchor-right' : 'anchor-left'" @click.stop>
      <span class="ptitle">Extraction run</span>
      <span class="prow"><span>Model</span><span class="v">{{ run.model || '—' }}</span></span>
      <span class="prow"><span>Provider</span><span class="v">{{ run.provider || '—' }}</span></span>
      <span class="prow"><span>Records</span><span class="v">{{ run.records }}</span></span>
      <span class="prow"><span>Citations</span><span class="v">{{ run.citations_resolved }}/{{ run.citations_total }}</span></span>
      <span class="prow"><span>Duration</span><span class="v">{{ seconds != null ? seconds + 's' : '—' }}</span></span>

      <span class="sep" />
      <span class="prow"><span>Input</span><span class="v">{{ (run.input_tokens || 0).toLocaleString() }}</span></span>
      <span class="prow"><span>From cache</span><span class="v">{{ (run.cache_read_tokens || 0).toLocaleString() }}</span></span>
      <span class="prow"><span>Output</span><span class="v">{{ (run.output_tokens || 0).toLocaleString() }}</span></span>
      <span class="prow total"><span>Cost</span><span class="v">{{ money(run.cost_usd) }}</span></span>
      <span v-if="cacheSaving" class="prow saved">
        <span>Saved by cache</span><span class="v">{{ money(cacheSaving) }}</span>
      </span>

      <span class="sep" />
      <span v-for="c in run.calls || []" :key="c.call" class="prow call" :class="{ bad: c.truncated || c.error }">
        <span>{{ CALL_LABELS[c.call] || c.call }}</span>
        <span class="v">
          {{ c.records }} recs · {{ k(c.output_tokens) }} out
          <template v-if="c.truncated"> · cut short</template>
          <template v-else-if="c.error"> · failed</template>
        </span>
      </span>

      <span v-if="trouble.length" class="note">
        {{ trouble.join(', ') }} did not come back whole, so those terms are incomplete.
      </span>
      <span class="ver">schema v{{ run.schema_version }}</span>
    </span>
  </span>
</template>

<style scoped>
.meta {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--muted);
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 1px 5px;
  cursor: default;
  white-space: nowrap;
}
.meta:hover, .meta:focus-visible { border-color: var(--line); background: var(--panel); outline: none; }
.meta.bad { color: var(--warn); }
.warn-dot {
  display: inline-grid; place-items: center;
  width: 13px; height: 13px; border-radius: 50%;
  background: var(--warn-weak); color: var(--warn); font-weight: 700; font-size: 9px;
}
.panel {
  position: absolute; top: calc(100% + 6px); z-index: 60;
  display: grid; gap: 3px; min-width: 268px;
  padding: 12px 14px;
  background: var(--panel); border: 1px solid var(--line-strong);
  border-radius: 10px; box-shadow: var(--shadow);
  font-family: var(--sans); color: var(--ink); white-space: normal; cursor: default;
}
.panel.anchor-left { left: 0; }
.panel.anchor-right { right: 0; }
.ptitle { font-weight: 600; font-size: 12px; margin-bottom: 3px; }
.prow { display: flex; justify-content: space-between; gap: 18px; font-size: 12px; color: var(--muted); }
.prow .v { color: var(--ink); font-variant-numeric: tabular-nums; }
.prow.total .v { font-weight: 600; }
.prow.saved .v { color: var(--ok); }
.prow.call { font-size: 11px; }
.prow.call.bad, .prow.call.bad .v { color: var(--warn); }
.sep { height: 1px; background: var(--line); margin: 5px 0; }
.note { font-size: 11px; color: var(--warn); line-height: 1.4; margin-top: 5px; }
.ver { font-size: 10px; color: var(--muted); margin-top: 4px; }
</style>
