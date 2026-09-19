<script setup>
import { computed } from 'vue'

import Dropdown from './Dropdown.vue'
import { FIELD_SPECS, MATCH_LABELS, money } from '../stores/engagement'

// Extracted terms as a ledger rather than a stack of cards.
//
// A card per term put one fact on screen per 150px and hid the amount until you clicked, so
// finding a term meant opening terms until one of them was it. The design system's own Table
// guidance describes this exact case — "reach for table--compact when the reader is scanning
// for one row among many" — and the columns below are chosen from what the real contract
// actually fills, not from what the schema could hold: on the Walmart statement of work
// program is populated 100% of the time, item 95%, frequency 83% and amount 64%, while
// sub_category and calculation are under a quarter and would have bought mostly whitespace.
//
// So the identifying column carries the item with the program beneath it — the system's rule,
// "the identifying column first with a table__s subtitle rather than a second column nobody
// sorts by" — and only frequency, amount and state earn a column of their own.
const props = defineProps({
  terms: { type: Array, default: () => [] },
  category: { type: String, default: 'pricing' },
  selectedId: { type: String, default: null },
  editable: { type: Boolean, default: true },
  catalogOptions: { type: Array, default: () => [] },
  busy: { type: String, default: '' },
  draft: { type: Object, default: null },
  // Record ids the re-upload check flagged: a change the customer asked for that this version
  // did not deliver. It outranks every other state, because it is the one a person must act on.
  violated: { type: Object, default: () => new Set() },
})
// The draft belongs to the parent, which owns the save. This component reports edits rather
// than writing into a prop.
const emit = defineEmits(['select', 'approve', 'edit', 'cancel', 'save', 'link', 'field'])

// Per category, because one generic column set across nine record types serves none of them.
// SLA deliberately has no figures column: its threshold is prose, and right-aligning prose to
// fake a col-num would be worse than admitting there is nothing to align.
const COLUMNS = {
  pricing: [
    { key: 'term', label: 'Term' },
    { key: 'frequency', label: 'Frequency', width: '112px' },
    { key: 'amount', label: 'Amount', width: '92px', num: true },
  ],
  sla: [
    { key: 'term', label: 'Service level' },
    { key: 'frequency', label: 'Measured', width: '128px' },
  ],
  reporting: [
    { key: 'term', label: 'Report' },
    { key: 'frequency', label: 'Frequency', width: '112px' },
  ],
  misc: [
    { key: 'term', label: 'Section' },
    { key: 'kind', label: 'Kind', width: '124px' },
  ],
}
const MISC_KIND = {
  definition: 'Definition',
  responsibility: 'Responsibility',
  online_tool: 'Online tool',
  signature: 'Signature',
  information_section: 'Information',
  uncategorised: 'Other',
}

const columns = computed(() => COLUMNS[props.category] || COLUMNS.misc)

function subtitle(t) {
  const r = t.record || {}
  // The subtitle earns its place: it is what separates two rows whose names are the same.
  // "Monthly Program Fee" appears under twenty-two programs in this corpus, and twice in this
  // one contract at $1.00 and $5.00 — the program and the vehicle class are the difference.
  const parts = [r.program, r.sub_category].filter(Boolean)
  if (!parts.length && t.subtitle) parts.push(t.subtitle)
  const line = parts.join(' · ')
  // A pricing row that names a program and prices nothing under it falls back to the program
  // for its headline too, so the line beneath would repeat it. Say the thing that is actually
  // true of the row instead — the customer is enrolled, there is simply no separate charge.
  if (!line || line.trim().toLowerCase() === (t.title || '').trim().toLowerCase()) {
    if (t.category === 'pricing' && !r.item) return 'Enrolled — nothing priced separately'
    return ''
  }
  return line
}

function secondary(t) {
  const r = t.record || {}
  if (props.category === 'sla') return r.service_level_standard || r.calculation || ''
  if (props.category === 'reporting') return r.report_specifications || ''
  if (props.category === 'misc') {
    return r.definition || r.task || r.description || r.detail || ''
  }
  return ''
}

// Every row says where it stands, because approving is the work and a blank cell reads as a
// rendering fault rather than as "nothing to do here". What varies is weight: the states that
// need a person are filled, and plain pending is quiet, so a screen of pending rows does not
// drown the handful that are actually flagged.
function state(t) {
  if (props.violated.has(t.record_id)) return { label: 'Not applied', cls: 'risk' }
  if (t.changed_since_approval) return { label: 'Changed', cls: 'risk' }
  if (t.needs_review && ['fuzzy', 'unmatched'].includes(t.catalog_match)) {
    return { label: 'Not in catalog', cls: 'warn' }
  }
  if (t.needs_review) return { label: 'Review', cls: 'warn' }
  if (t.approved) return { label: 'Approved', cls: 'ok' }
  return { label: 'Pending', cls: 'quiet' }
}

const spec = (t) => FIELD_SPECS[t.info_type] || []
const shownValue = (v) => (v == null || v === '' ? '—' : String(v))
const unplaced = (t) =>
  t.category === 'pricing' && ['fuzzy', 'unmatched'].includes(t.catalog_match)
</script>

<template>
  <div class="twrap">
    <table class="table table--compact table--sticky">
      <thead>
        <tr>
          <th v-for="c in columns" :key="c.key" :class="{ 'col-num': c.num }" :style="c.width ? { width: c.width } : null">
            {{ c.label }}
          </th>
          <th class="col-state">State</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="t in terms" :key="t.record_id">
          <tr
            class="trow"
            :class="{ 'is-sel': selectedId === t.record_id, violated: violated.has(t.record_id) }"
            @click="emit('select', t)"
          >
            <td>
              <span class="table__t">{{ t.title }}</span>
              <span v-if="subtitle(t)" class="table__s">{{ subtitle(t) }}</span>
              <span v-else-if="secondary(t)" class="table__s clamp">{{ secondary(t) }}</span>
            </td>

            <td v-if="category === 'misc'" class="kind">{{ MISC_KIND[t.info_type] || t.info_type }}</td>
            <td v-else class="freq">{{ t.record?.frequency || '—' }}</td>

            <td v-if="category === 'pricing'" class="col-num">
              <template v-if="t.amount != null">{{ money(t.amount) }}</template>
              <span v-else-if="t.record?.included" class="incl">incl.</span>
              <span v-else class="none">—</span>
            </td>

            <td class="col-state">
              <span class="badge" :class="state(t).cls">{{ state(t).label }}</span>
            </td>
          </tr>

          <!-- The detail opens under its own row rather than in a panel, so the list never
               moves and the reader keeps their place in a list of three hundred. -->
          <tr v-if="selectedId === t.record_id" class="detail">
            <td :colspan="columns.length + 1">
              <div v-if="t.changed_since_approval" class="moved">
                This term changed since it was approved, so the approval was withdrawn.
              </div>

              <dl class="kv">
                <template v-for="[key, label, kind] in spec(t)" :key="key">
                  <dt>{{ label }}</dt>
                  <dd>
                    <template v-if="draft">
                      <textarea
                        v-if="kind === 'long'"
                        :value="draft[key]"
                        rows="3"
                        @input="emit('field', key, $event.target.value)"
                        @click.stop
                      />
                      <input
                        v-else
                        :value="draft[key]"
                        :type="kind === 'money' ? 'number' : 'text'"
                        @input="emit('field', key, $event.target.value)"
                        @click.stop
                      />
                    </template>
                    <span v-else :class="{ long: kind === 'long', num: kind === 'money' }">
                      {{ kind === 'money' ? (t.record?.[key] == null ? '—' : money(t.record[key])) : shownValue(t.record?.[key]) }}
                    </span>
                  </dd>
                </template>
              </dl>

              <div v-if="t.category === 'pricing'" class="catalog" :class="{ unplaced: unplaced(t) }">
                <span class="muted small">{{ MATCH_LABELS[t.catalog_match] || 'Not in catalog' }}</span>
                <div v-if="unplaced(t) && editable" class="linkbox" @click.stop>
                  <Dropdown
                    :model-value="t.program_id || ''"
                    :options="catalogOptions"
                    placeholder="Link to a service…"
                    @update:model-value="(v) => emit('link', t, v)"
                  />
                </div>
              </div>

              <div v-if="t.citations?.length" class="cite muted small">
                📄 p{{ t.citations[0].page || '?' }}
                <span v-if="t.citations[0].section_label"> · {{ t.citations[0].section_label }}</span>
                <em v-if="t.citations[0].quote"> — “{{ t.citations[0].quote }}”</em>
              </div>
              <div v-else class="cite muted small">No quotation was recorded for this term.</div>

              <div v-if="editable" class="acts" @click.stop>
                <template v-if="draft">
                  <button class="primary sm" :disabled="!!busy" @click="emit('save', t)">Save &amp; approve</button>
                  <button class="ghost sm" @click="emit('cancel')">Cancel</button>
                </template>
                <template v-else>
                  <button v-if="!t.approved" class="primary sm" :disabled="!!busy" @click="emit('approve', t)">Approve</button>
                  <button class="ghost sm" @click="emit('edit', t)">Correct</button>
                </template>
              </div>
            </td>
          </tr>
        </template>

        <tr v-if="!terms.length">
          <td :colspan="columns.length + 1" class="muted empty">Nothing here.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.twrap { width: 100%; }
.table { width: 100%; border-collapse: collapse; font: 400 13.5px/1.5 var(--sans); color: var(--ink); }
.table thead th {
  padding: 11px 14px; text-align: left; white-space: nowrap; background: var(--panel);
  border-bottom: 1px solid var(--line);
  font: 500 10.5px/1 var(--sans); letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted);
}
/* A header that scrolls away turns every figure into a guess. */
.table--sticky thead th { position: sticky; top: 0; z-index: 3; }
.table td { padding: 12px 14px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.table--compact td, .table--compact thead th { padding-top: 8px; padding-bottom: 8px; }
.table tbody tr:last-child td { border-bottom: 0; }
.trow { cursor: pointer; transition: background 0.12s ease; }
.trow:hover { background: var(--bg); }
/* The rule carries the state where the eye starts; the tint holds it across the width. */
.trow.is-sel, .trow.is-sel:hover {
  background: linear-gradient(90deg, var(--accent) 0 3px, var(--accent-weak) 3px);
}
/* Colour never marks alone — the State cell carries a label beside it. */
.trow.violated { background: linear-gradient(90deg, var(--warn) 0 3px, var(--warn-weak) 3px); }
.trow.violated:hover { background: linear-gradient(90deg, var(--warn) 0 3px, var(--warn-weak) 3px); }
.table__t { font-weight: 500; display: block; }
.table__s { display: block; margin-top: 2px; font-size: 12px; color: var(--ink-soft); }
.table__s.clamp { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
/* Figures right-aligned and tabular, so digits line up under their own name. */
.col-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.col-state { width: 1%; white-space: nowrap; text-align: right; }
.freq, .kind { color: var(--ink-soft); font-size: 12.5px; }
.none { color: var(--muted); }
.incl { color: var(--ok); font-size: 12px; }
.empty { padding: 22px 14px; }
/* The system's quiet badge: present, outlined, carrying no colour of its own — a state that is
   true of most rows should not shout on every one of them. */
.badge.quiet { background: transparent; color: var(--muted); border: 1px solid var(--line); font-weight: 500; }
.col-state .badge { font-size: 11px; padding: 2px 8px; }
.small { font-size: 12px; }

.detail td { background: var(--panel); border-bottom: 1px solid var(--line); padding: 14px 16px 16px; }
.moved { margin-bottom: 12px; font-size: 12px; color: var(--risk); background: var(--risk-weak); padding: 8px 10px; border-radius: 8px; }
/* A description list, because these are the properties of one record rather than rows to sort. */
.kv { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px; margin: 0; }
.kv dt { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; padding-top: 3px; }
.kv dd { margin: 0; font-size: 13px; line-height: 1.5; min-width: 0; }
.kv dd .long { white-space: pre-wrap; }
.kv dd .num { font-variant-numeric: tabular-nums; }
.kv input, .kv textarea { width: 100%; }
.catalog { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); }
.catalog.unplaced { color: var(--warn); }
.linkbox { width: 260px; }
.cite { margin-top: 10px; line-height: 1.5; }
.acts { display: flex; gap: 8px; margin-top: 12px; }
</style>
