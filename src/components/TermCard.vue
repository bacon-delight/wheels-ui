<script setup>
import { computed, ref, watch } from 'vue'

import ConfidenceBadge from './ConfidenceBadge.vue'
import Dropdown from './Dropdown.vue'
import { FIELD_SPECS, MATCH_LABELS, infoTypeLabel, money } from '../stores/engagement'

// One card for all nine record types, driven by a per-type field spec. The form it replaces
// only knew how to render a fee, which is why eight of the nine had nowhere to go.
const props = defineProps({
  term: { type: Object, required: true },
  selected: { type: Boolean, default: false },
  editable: { type: Boolean, default: true },
  catalogOptions: { type: Array, default: () => [] },
  busy: { type: String, default: '' },
})
const emit = defineEmits(['select', 'approve', 'save'])

const editing = ref(false)
const draft = ref({})
const programDraft = ref('')

const spec = computed(() => FIELD_SPECS[props.term.info_type] || [])
const record = computed(() => props.term.record || {})
// A term the catalog could not place, or placed only loosely, is the one an analyst's
// judgement improves most — so it is called out rather than left to be noticed.
const unplaced = computed(
  () => props.term.category === 'pricing' && ['fuzzy', 'unmatched'].includes(props.term.catalog_match),
)

watch(
  () => props.selected,
  (on) => {
    if (!on) editing.value = false
  },
)

function startEdit() {
  draft.value = { ...record.value }
  programDraft.value = props.term.program_id || ''
  editing.value = true
}
function save() {
  emit('save', props.term, draft.value)
  editing.value = false
}
function linkTo(programId) {
  const program = props.catalogOptions.find((o) => o.value === programId)
  if (program) emit('save', props.term, { ...record.value, program: program.label })
}
const shown = (value) => (value == null || value === '' ? '—' : String(value))
</script>

<template>
  <div
    class="tcard"
    :class="{
      sel: selected,
      flagged: term.needs_review,
      approved: term.approved,
      moved: term.changed_since_approval,
    }"
    @click="emit('select', term)"
  >
    <div class="head">
      <div class="hleft">
        <strong class="title">{{ term.title }}</strong>
        <span v-if="term.subtitle" class="muted small sub">{{ term.subtitle }}</span>
      </div>
      <div class="hright">
        <span v-if="term.amount != null" class="amt">{{ money(term.amount) }}</span>
        <span v-if="term.approved" class="badge ok">Approved</span>
        <span v-else-if="term.needs_review" class="badge warn">Review</span>
        <ConfidenceBadge :value="term.confidence" />
      </div>
    </div>

    <!-- Collapsed rows stay one line. Three hundred open editors is unusable. -->
    <template v-if="selected">
      <div v-if="term.changed_since_approval" class="moved-note">
        This term changed since it was approved, so the approval was withdrawn.
      </div>

      <div class="fields">
        <div v-for="[key, label, kind] in spec" :key="key" class="fld">
          <span class="flabel">{{ label }}</span>
          <template v-if="editing">
            <textarea v-if="kind === 'long'" v-model="draft[key]" rows="3" />
            <input v-else v-model="draft[key]" :type="kind === 'money' ? 'number' : 'text'" />
          </template>
          <span v-else class="fval" :class="{ long: kind === 'long' }">
            {{ kind === 'money' ? (record[key] == null ? '—' : money(record[key])) : shown(record[key]) }}
          </span>
        </div>
      </div>

      <div v-if="term.category === 'pricing'" class="catalog" :class="{ unplaced }">
        <span class="muted small">{{ MATCH_LABELS[term.catalog_match] || 'Not in catalog' }}</span>
        <!-- Linking a term to a service is the correction that changes what the customer is
             shown to be buying, so it belongs here rather than in a settings page. -->
        <div v-if="unplaced && editable" class="linkbox">
          <Dropdown
            :model-value="term.program_id || ''"
            :options="catalogOptions"
            placeholder="Link to a service…"
            @update:model-value="linkTo"
          />
        </div>
      </div>

      <div v-if="term.citations?.length" class="cite muted small">
        📄 p{{ term.citations[0].page || '?' }}
        <span v-if="term.citations[0].section_label"> · {{ term.citations[0].section_label }}</span>
        <em v-if="term.citations[0].quote"> — “{{ term.citations[0].quote }}”</em>
      </div>
      <div v-else class="cite muted small">No quotation was recorded for this term.</div>

      <div v-if="editable" class="acts" @click.stop>
        <template v-if="editing">
          <button class="primary sm" :disabled="!!busy" @click="save">Save & approve</button>
          <button class="ghost sm" @click="editing = false">Cancel</button>
        </template>
        <template v-else>
          <button v-if="!term.approved" class="primary sm" :disabled="!!busy" @click="emit('approve', term)">
            Approve
          </button>
          <button class="ghost sm" @click="startEdit">Correct</button>
        </template>
      </div>
    </template>

    <div v-else class="peek muted small">
      <span>{{ infoTypeLabel(term.info_type) }}</span>
      <span v-if="term.frequency"> · {{ term.frequency }}</span>
      <span v-if="unplaced" class="unplaced-hint"> · not in catalog</span>
    </div>
  </div>
</template>

<style scoped>
.tcard { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: var(--panel); cursor: pointer; }
.tcard:hover { border-color: var(--line-strong); }
.tcard.sel { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); cursor: default; }
.tcard.flagged { border-left: 3px solid var(--warn); }
.tcard.approved { border-left: 3px solid var(--ok); }
.tcard.moved { border-left: 3px solid var(--risk); }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.hleft { min-width: 0; }
.title { display: block; line-height: 1.35; }
.sub { display: block; margin-top: 2px; }
.hright { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.amt { font-weight: 600; font-variant-numeric: tabular-nums; }
.small { font-size: 12px; }
.peek { margin-top: 6px; }
.unplaced-hint { color: var(--warn); }
.moved-note { margin-top: 10px; font-size: 12px; color: var(--risk); background: var(--risk-weak); padding: 8px 10px; border-radius: 8px; }
.fields { display: grid; gap: 10px; margin-top: 12px; }
.fld { display: grid; gap: 3px; }
.flabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; }
.fval { font-size: 13px; line-height: 1.5; }
.fval.long { white-space: pre-wrap; }
.catalog { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
.catalog.unplaced { color: var(--warn); }
.linkbox { width: 260px; }
.cite { margin-top: 10px; line-height: 1.5; }
.acts { display: flex; gap: 8px; margin-top: 12px; }
</style>
