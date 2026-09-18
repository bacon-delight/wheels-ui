<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ConfidenceBadge from '../components/ConfidenceBadge.vue'
import SidePanel from '../components/SidePanel.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { prettyService } from '../stores/engagement'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { eid, did, version } = route.params
const base = `/engagements/${eid}/documents/${did}/versions/${version}`

const pages = ref([])
const fields = ref([])
const sid = ref(null)
const needsReview = ref(0)
const selected = ref(null)
const busy = ref('')
const bulkBusy = ref(false)
const err = ref('')
const loaded = ref(false)
const pageEls = ref({})
const editing = ref({}) // field_id -> bool
const drafts = ref({}) // field_id -> [fee_item copies]

const canApprove = computed(() => auth.isProvider)
const pendingCount = computed(() => fields.value.filter((f) => f.elected && !f.approved).length)

// --- change verification ---
// It used to sit inline above the split and swallow the screen. It is now a drawer behind a
// counted trigger, and the terms it flags are marked in the field list so the finding survives
// closing the panel.
const review = ref(null)
const reviewOpen = ref(false)

const CR_STATUS = {
  applied: { label: 'Applied', cls: 'ok' },
  partial: { label: 'Partial', cls: 'warn' },
  not_applied: { label: 'Not applied', cls: 'risk' },
  unrelated: { label: 'Not requested', cls: 'info' },
  new: { label: 'Changed', cls: 'info' },
}
// A violation is a request the re-upload did not honour, or a change nobody asked for.
const VIOLATION = new Set(['partial', 'not_applied', 'unrelated'])

const reviewItems = computed(() => review.value?.items || [])
const violations = computed(() => reviewItems.value.filter((it) => VIOLATION.has(it.status)))
const violationCount = computed(() => violations.value.length)

// `service` arrives as "Remarketing (MLA)"; the field list keys on the bare service name.
const bareService = (s) => (s || '').split('(')[0].trim()
const violatedServices = computed(() => new Set(violations.value.map((it) => bareService(it.service))))
const violationFor = (service) => violations.value.find((it) => bareService(it.service) === service)

async function loadReview(submissionId) {
  if (!submissionId) return
  try {
    review.value = (await api.get(`/engagements/${eid}/submissions/${submissionId}/change-review`)).data
  } catch {
    review.value = null
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v ?? []))

async function load() {
  try {
    const [p, f, e] = await Promise.all([
      api.get(`${base}/pages`),
      api.get(`${base}/fields`),
      api.get(`/engagements/${eid}`),
    ])
    pages.value = p.data.pages
    fields.value = f.data.fields
    sid.value = e.data.submission?.submission_id || null
    if (sid.value) loadReview(sid.value)
    needsReview.value = f.data.needs_review_count
    const d = {}
    for (const fld of fields.value) d[fld.field_id] = clone(fld.fee_items)
    drafts.value = d
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  } finally {
    loaded.value = true
  }
}

function selectField(f) {
  selected.value = f
  const page = f.citations?.[0]?.page
  if (page && pageEls.value[page]) {
    pageEls.value[page].scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function highlightsOn(pageNum) {
  if (!selected.value) return []
  return (selected.value.citations || []).filter((c) => c.page === pageNum && c.bbox)
}

function rectStyle(b) {
  return {
    left: `${b.x0 * 100}%`,
    top: `${b.y0 * 100}%`,
    width: `${(b.x1 - b.x0) * 100}%`,
    height: `${(b.y1 - b.y0) * 100}%`,
  }
}

const money = (n) =>
  n == null ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

function startEdit(f) {
  editing.value = { ...editing.value, [f.field_id]: true }
}
function cancelEdit(f) {
  drafts.value[f.field_id] = clone(f.fee_items)
  editing.value = { ...editing.value, [f.field_id]: false }
}

async function patchField(f, payload, tag) {
  busy.value = tag
  err.value = ''
  try {
    await api.patch(`${base}/fields/${f.service}/${f.field_id}`, payload)
    editing.value = { ...editing.value, [f.field_id]: false }
    await load()
    if (selected.value?.field_id === f.field_id) selected.value = null
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

const approve = (f) => patchField(f, { approved: true }, f.field_id)
const saveCorrection = (f) =>
  patchField(f, { fee_items: drafts.value[f.field_id], approved: true }, f.field_id)

async function approveAll() {
  bulkBusy.value = true
  err.value = ''
  try {
    for (const f of fields.value.filter((x) => x.elected && !x.approved)) {
      await api.patch(`${base}/fields/${f.service}/${f.field_id}`, { approved: true })
    }
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  bulkBusy.value = false
}

onMounted(() => {
  // The split-screen is a provider underwriting tool; clients get the clean terms view.
  if (!auth.isProvider) {
    router.replace(`/engagements/${eid}`)
    return
  }
  load()
})
</script>

<template>
  <div class="review">
    <div class="rhead">
      <router-link :to="`/engagements/${eid}`" class="muted">← Back to engagement</router-link>
      <div class="row">
        <button
          v-if="review && review.applicable"
          class="sm crtrigger"
          :class="{ hasflag: violationCount > 0 }"
          type="button"
          @click="reviewOpen = true"
        >
          Change verification
          <span class="countbadge" :class="{ zero: violationCount === 0 }">{{ violationCount }}</span>
        </button>
        <span v-if="needsReview" class="badge low">{{ needsReview }} need review</span>
        <span v-else class="badge high">All reviewed</span>
        <button
          v-if="canApprove && pendingCount"
          class="primary sm"
          :disabled="bulkBusy"
          @click="approveAll"
        >
          {{ bulkBusy ? 'Approving…' : `Approve all (${pendingCount})` }}
        </button>
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>

    <div class="split">
      <div class="doc-pane">
        <div v-for="p in pages" :key="p.page" class="page-wrap" :ref="(el) => (pageEls[p.page] = el)">
          <img :src="p.image_url" :alt="`page ${p.page}`" loading="lazy" />
          <div v-for="(c, i) in highlightsOn(p.page)" :key="i" class="hl" :style="rectStyle(c.bbox)" />
          <div class="pageno">Page {{ p.page }}</div>
        </div>
        <p v-if="!pages.length && !loaded" class="muted" style="padding: 20px">Rendering pages…</p>
        <p v-else-if="!pages.length" class="muted" style="padding: 20px">
          This document hasn't been processed yet — upload it and run extraction first.
        </p>
      </div>

      <div class="fields-pane">
        <div
          v-for="f in fields"
          :key="f.field_id"
          class="fcard"
          :class="{ sel: selected?.field_id === f.field_id, flagged: f.needs_review, off: !f.elected, edit: editing[f.field_id], violation: violatedServices.has(f.service) }"
          @click="selectField(f)"
        >
          <div class="spread">
            <div class="row">
              <strong :class="{ vterm: violatedServices.has(f.service) }">{{ f.service }}</strong>
              <span v-if="!f.elected" class="pill off-pill">Not elected</span>
            </div>
            <div class="row">
              <span v-if="editing[f.field_id]" class="badge low">editing</span>
              <span v-else-if="f.needs_review" class="badge low">review</span>
              <span v-else-if="f.approved" class="badge high">approved</span>
              <ConfidenceBadge :value="f.confidence" />
            </div>
          </div>

          <div v-if="violationFor(f.service)" class="vnote">
            <div class="vhead">
              <strong>{{ CR_STATUS[violationFor(f.service).status]?.label || violationFor(f.service).status }}</strong>
              <button class="link sm" type="button" @click.stop="reviewOpen = true">Details</button>
            </div>
            <div v-if="violationFor(f.service).requested"><span class="muted">Requested:</span> {{ violationFor(f.service).requested }}</div>
            <div v-if="violationFor(f.service).delivered"><span class="muted">Delivered:</span> {{ violationFor(f.service).delivered }}</div>
          </div>

          <div v-if="f.notes" class="muted small">{{ f.notes }}</div>

          <!-- Editable fee items: pre-filled inputs, disabled until "Correct". -->
          <div v-for="(fi, i) in drafts[f.field_id] || []" :key="i" class="feeedit">
            <span class="ftype">{{ fi.fee_type }}</span>
            <textarea
              v-model="fi.description"
              :disabled="!editing[f.field_id]"
              rows="2"
              class="fi-desc"
              @click.stop
            />
            <div class="fi-row" v-if="editing[f.field_id] || fi.amount != null || fi.rate_pct != null || fi.unit_basis">
              <label v-if="editing[f.field_id] || fi.amount != null">$<input type="number" step="0.01" v-model.number="fi.amount" :disabled="!editing[f.field_id]" @click.stop /></label>
              <label v-if="editing[f.field_id] || fi.rate_pct != null">%<input type="number" step="0.01" v-model.number="fi.rate_pct" :disabled="!editing[f.field_id]" @click.stop /></label>
              <label class="unit" v-if="editing[f.field_id] || fi.unit_basis">unit<input v-model="fi.unit_basis" :disabled="!editing[f.field_id]" @click.stop /></label>
            </div>
            <ul v-if="fi.tier_bands?.length" class="tiers">
              <li v-for="(t, j) in fi.tier_bands" :key="j">
                units {{ t.min_units }}–{{ t.max_units ?? '∞' }}: {{ money(t.amount) }}
              </li>
            </ul>
            <div v-for="(c, k) in fi.conditions || []" :key="k" class="cond">⚑ {{ c.description }}</div>
          </div>

          <div v-if="f.citations?.length" class="cite muted small">
            📄 p{{ f.citations[0].page }}<span v-if="f.citations[0].section_label"> · {{ f.citations[0].section_label }}</span>
            <em v-if="f.citations[0].quote"> — “{{ f.citations[0].quote }}”</em>
          </div>

          <div v-if="canApprove && f.elected" class="actions">
            <template v-if="!editing[f.field_id]">
              <button v-if="!f.approved" class="primary sm" :disabled="busy === f.field_id" @click.stop="approve(f)">
                {{ busy === f.field_id ? '…' : 'Approve' }}
              </button>
              <button class="sm" @click.stop="startEdit(f)">Correct</button>
            </template>
            <template v-else>
              <button class="primary sm" :disabled="busy === f.field_id" @click.stop="saveCorrection(f)">
                {{ busy === f.field_id ? 'Saving…' : 'Save & approve' }}
              </button>
              <button class="sm" @click.stop="cancelEdit(f)">Cancel</button>
            </template>
          </div>
        </div>

        <p v-if="!fields.length && !loaded" class="muted" style="padding: 20px">Loading…</p>
        <p v-else-if="!fields.length && !canApprove" class="muted" style="padding: 20px">
          Approved terms will appear here once the provider submits them for your review.
        </p>
        <p v-else-if="!fields.length" class="muted" style="padding: 20px">
          No extracted terms yet — run extraction on this document.
        </p>
      </div>
    </div>

    <SidePanel
      :open="reviewOpen"
      title="Change verification"
      subtitle="What the re-uploaded agreement actually changed, against what the client asked for."
      @close="reviewOpen = false"
    >
      <template v-if="review">
        <div v-if="review.requested" class="crask">
          <div class="label">Client asked</div>
          <p>“{{ review.requested }}”</p>
        </div>
        <p v-if="review.overall" class="croverall">{{ review.overall }}</p>

        <div v-if="violationCount" class="label" style="margin: 18px 0 8px">
          {{ violationCount }} term{{ violationCount === 1 ? '' : 's' }} needing attention
        </div>
        <div
          v-for="(it, i) in reviewItems"
          :key="i"
          class="cri"
          :class="{ flag: VIOLATION.has(it.status) }"
        >
          <div class="crhead">
            <strong :class="{ vterm: VIOLATION.has(it.status) }">{{ prettyService(it.service) }}</strong>
            <span class="badge" :class="CR_STATUS[it.status]?.cls || 'info'">{{ CR_STATUS[it.status]?.label || it.status }}</span>
          </div>
          <div class="crbody">
            <div v-if="it.requested"><span class="muted">Requested:</span> {{ it.requested }}</div>
            <div v-if="it.delivered"><span class="muted">Delivered:</span> {{ it.delivered }}</div>
            <div v-if="it.note" class="crnote">{{ it.note }}</div>
          </div>
        </div>
        <p v-if="!reviewItems.length" class="muted">No field-level differences detected between the two versions.</p>
      </template>
    </SidePanel>
  </div>
</template>

<style scoped>
.review { height: calc(100vh - 58px); display: flex; flex-direction: column; }
.rhead { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); background: #fff; }
.err { color: var(--risk); padding: 8px 20px; }
.split { flex: 1; display: grid; grid-template-columns: 1.2fr 1fr; min-height: 0; }
.doc-pane { overflow-y: auto; background: #dfe6f0; padding: 16px; }
.page-wrap { position: relative; max-width: 720px; margin: 0 auto 16px; box-shadow: var(--shadow); background: #fff; }
.page-wrap img { display: block; width: 100%; }
.hl { position: absolute; background: rgba(246, 199, 68, 0.38); outline: 2px solid var(--accent); border-radius: 2px; animation: pulse 1.2s ease-in-out 2; }
@keyframes pulse { 0%,100% { background: rgba(246,199,68,0.28); } 50% { background: rgba(246,199,68,0.55); } }
.pageno { position: absolute; top: 6px; right: 8px; font-size: 11px; color: var(--muted); background: rgba(255,255,255,0.85); padding: 1px 6px; border-radius: 4px; }
.fields-pane { overflow-y: auto; padding: 14px; background: var(--bg); }
.fcard { background: #fff; border: 1px solid var(--line); border-left: 3px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; cursor: pointer; }
.fcard:hover { border-color: var(--accent); }
.fcard.sel { border-left-color: var(--accent); box-shadow: var(--shadow); }
.fcard.flagged { border-left-color: var(--risk); }
.fcard.edit { border-left-color: var(--accent); background: #f6f9fe; cursor: default; }
.fcard.off { opacity: 0.72; }
.off-pill { background: #eef0f2; color: var(--muted); }

/* --- change verification trigger + flagged terms --- */
.crtrigger { display: inline-flex; align-items: center; gap: 8px; }
.crtrigger.hasflag { border-color: var(--warn); color: var(--warn); }
/* A count, not a state: filled rather than tinted, tabular figures, circular under two digits. */
.countbadge {
  min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px;
  background: var(--risk); color: #fff; font-size: 11px; line-height: 19px;
  font-weight: 600; text-align: center; font-variant-numeric: tabular-nums;
}
.countbadge.zero { background: var(--muted); }
.fcard.violation { border-left-color: var(--warn); background: var(--warn-weak); }
/* Colour never marks alone: the term keeps a label and the card keeps its badge. */
.vterm { background: var(--warn-weak); color: var(--warn); padding: 1px 5px; border-radius: 6px; }
.vnote {
  position: relative; margin: 8px 0 4px; padding: 10px 12px; border-radius: 10px;
  background: var(--warn-weak); font-size: 12.5px; line-height: 1.55; overflow: hidden;
}
.vnote::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--warn); }
.vhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 4px; }
.vhead strong { color: var(--warn); }
.link { background: none; border: none; padding: 0; color: var(--accent-ink); font-weight: 600; cursor: pointer; }
.crask { background: var(--panel-2); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.crask p { margin: 4px 0 0; font-style: italic; }
.croverall { margin: 0; font-size: 15px; line-height: 1.55; }
.cri { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.cri.flag { border-color: var(--warn); background: var(--warn-weak); }
.crhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
.crbody { font-size: 13px; line-height: 1.6; }
.crnote { color: var(--ink-soft); margin-top: 4px; }
.small { font-size: 12px; }
.feeedit { margin: 8px 0; padding: 8px; border: 1px solid var(--line); border-radius: 6px; }
.ftype { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--accent); font-weight: 600; }
.fi-desc { width: 100%; margin-top: 4px; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; font: inherit; resize: vertical; }
.fi-row { display: flex; gap: 8px; margin-top: 6px; }
.fi-row label { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); flex: 1; }
.fi-row input { width: 100%; padding: 5px 7px; border: 1px solid var(--line); border-radius: 6px; font: inherit; }
.fi-row label.unit { flex: 1.4; }
/* Disabled inputs read as clean read-only values, not greyed-out form fields. */
input:disabled, textarea:disabled { background: #f7f9fa; color: var(--ink); border-color: transparent; cursor: default; -webkit-text-fill-color: var(--ink); opacity: 1; }
.tiers { margin: 4px 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
.cond { color: var(--warn); font-size: 12px; margin-top: 2px; }
.cite { margin-top: 6px; }
.actions { margin-top: 10px; display: flex; gap: 8px; }
@media (max-width: 820px) { .split { grid-template-columns: 1fr; } }
</style>
