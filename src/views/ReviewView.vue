<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ExtractionMeta from '../components/ExtractionMeta.vue'
import SidePanel from '../components/SidePanel.vue'
import TermTable from '../components/TermTable.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'
import { useCatalogStore } from '../stores/catalog'
import { CATEGORIES, prettyService } from '../stores/engagement'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const catalog = useCatalogStore()
const { eid, did, version } = route.params
const base = `/engagements/${eid}/documents/${did}/versions/${version}`

const pages = ref([])
const terms = ref([])
const counts = ref({})
const run = ref(null)
const sid = ref(null)
const needsReview = ref(0)
const selected = ref(null)
const busy = ref('')
const bulkBusy = ref(false)
const err = ref('')
const loaded = ref(false)
const pageEls = ref({})
const tab = ref('pricing')

const canApprove = computed(() => auth.isProvider)

// A contract yields records in four categories. The tabs are how an analyst works one at a
// time rather than scrolling past three hundred cards to reach the money.
const tabs = computed(() =>
  CATEGORIES.map((c) => ({ ...c, count: counts.value[c.key] || 0 })),
)
// How the screen is divided, as a percentage given to the contract pane. The terms are the
// work and the contract is the evidence, so the terms get the larger half by default — the
// reverse of what this started as. It is a preference, not a rule, so it is draggable and
// remembered per person.
const SPLIT_KEY = 'wheels.review.split'
const SPLIT_DEFAULT = 42
const SPLIT_MIN = 22
const SPLIT_MAX = 72

function readSplit() {
  try {
    const saved = Number(localStorage.getItem(SPLIT_KEY))
    if (Number.isFinite(saved) && saved >= SPLIT_MIN && saved <= SPLIT_MAX) return saved
  } catch {
    /* private browsing and blocked storage both land here; the default is fine */
  }
  return SPLIT_DEFAULT
}
const split = ref(readSplit())
const dragging = ref(false)
const splitEl = ref(null)

function persistSplit() {
  try {
    localStorage.setItem(SPLIT_KEY, String(Math.round(split.value)))
  } catch {
    /* a preference that cannot be saved is still a preference for this session */
  }
}
const clamp = (n) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n))

function onDragMove(e) {
  if (!splitEl.value) return
  const box = splitEl.value.getBoundingClientRect()
  split.value = clamp(((e.clientX - box.left) / box.width) * 100)
}
function endDrag() {
  dragging.value = false
  persistSplit()
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', endDrag)
}
function startDrag(e) {
  e.preventDefault()
  dragging.value = true
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', endDrag)
}
// The handle is a real separator, so it can be moved without a pointer.
function nudge(by) {
  split.value = clamp(split.value + by)
  persistSplit()
}
function resetSplit() {
  split.value = SPLIT_DEFAULT
  persistSplit()
}

const query = ref('')
// Search reads the whole record, not just the headline. An analyst looking for "$15" or
// "per card" or a program name is as likely to be after a value or a frequency as a title,
// and a search that only matched titles would quietly find nothing.
function haystack(t) {
  const parts = [t.title, t.subtitle, t.frequency, t.amount == null ? '' : String(t.amount)]
  for (const [key, value] of Object.entries(t.record || {})) {
    if (key === 'citations' || key === 'info_type') continue
    if (typeof value === 'string' || typeof value === 'number') parts.push(String(value))
  }
  parts.push(t.citations?.[0]?.quote || '')
  return parts.join(' ').toLowerCase()
}
const shown = computed(() => {
  const rows = terms.value.filter((t) => t.category === tab.value)
  const needle = query.value.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter((t) => haystack(t).includes(needle))
})
// How many the search found in the categories you are NOT looking at, so a term in another
// tab is discoverable rather than silently absent.
const hitsElsewhere = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return []
  return CATEGORIES.filter((c) => c.key !== tab.value)
    .map((c) => ({
      ...c,
      n: terms.value.filter((t) => t.category === c.key && haystack(t).includes(needle)).length,
    }))
    .filter((c) => c.n)
})
// The header speaks for the document, so its figures count the document. A pricing-only
// total sitting up there read as wrong while standing in SLA, because it was describing a
// category from a bar that belongs to the whole contract.
const approvedCount = computed(() => terms.value.filter((t) => t.approved).length)
const pendingInTab = computed(() => shown.value.filter((t) => !t.approved).length)

// --- change verification ---
// It used to sit inline above the split and swallow the screen. It is now a drawer behind a
// counted trigger, and the terms it flags are marked in the list so the finding survives
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
const bareService = (s) => (s || '').split('(')[0].trim()
const violatedPrograms = computed(
  () => new Set(violations.value.map((it) => bareService(it.service))),
)
// Which stored terms the re-upload check flagged, by id, so the table can mark them.
const violatedIds = computed(
  () =>
    new Set(
      terms.value
        .filter(
          (t) =>
            t.category === 'pricing' &&
            violatedPrograms.value.has(bareService(t.record?.program)),
        )
        .map((t) => t.record_id),
    ),
)

async function loadReview(submissionId) {
  if (!submissionId) return
  try {
    review.value = (
      await api.get(`/engagements/${eid}/submissions/${submissionId}/change-review`)
    ).data
  } catch {
    review.value = null
  }
}

async function load() {
  try {
    const [p, t, e] = await Promise.all([
      api.get(`${base}/pages`),
      api.get(`${base}/terms`),
      api.get(`/engagements/${eid}`),
    ])
    pages.value = p.data.pages
    terms.value = t.data.terms
    counts.value = t.data.counts_by_category || {}
    needsReview.value = t.data.needs_review_count
    sid.value = e.data.submission?.submission_id || null
    const doc = (e.data.documents || []).find((d) => d.document_id === did)
    run.value = doc?.extraction_run || null
    if (sid.value) loadReview(sid.value)
    // Open on a category that actually has something in it.
    if (!counts.value[tab.value]) {
      tab.value = CATEGORIES.find((c) => counts.value[c.key])?.key || 'pricing'
    }
    catalog.load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  } finally {
    loaded.value = true
  }
}

function selectTerm(t) {
  // Cards collapse by default and only the selected one opens its editor: three hundred live
  // textareas is not a usable screen.
  const same = selected.value?.record_id === t.record_id
  if (!same) draft.value = null
  selected.value = same ? null : t
  const page = t.citations?.[0]?.page
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

async function patchTerm(t, payload) {
  busy.value = t.record_id
  err.value = ''
  try {
    await api.patch(`${base}/terms/${t.category}/${t.record_id}`, payload)
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

const approveTerm = (t) => patchTerm(t, { approved: true })

// The correction draft lives here, with the save, rather than inside the row that renders it.
const draft = ref(null)
function startEdit(t) {
  draft.value = { ...(t.record || {}) }
}
function saveDraft(t) {
  const record = draft.value
  draft.value = null
  patchTerm(t, { record, approved: true })
}
function linkTerm(t, programId) {
  const program = catalog.options.find((o) => o.value === programId)
  if (program) patchTerm(t, { record: { ...(t.record || {}), program: program.label } })
}

async function approveTab() {
  // One request rather than one per term. The serial loop this replaces was three hundred
  // round trips at the volume a real contract produces.
  bulkBusy.value = true
  err.value = ''
  try {
    await api.post(`${base}/terms:approve`, {}, { params: { category: tab.value } })
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  bulkBusy.value = false
}

onMounted(() => {
  // The split-screen is a provider underwriting tool; customers get the clean terms view.
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
        <ExtractionMeta :run="run" align="right" />
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
        <span v-else-if="loaded" class="badge high">All reviewed</span>
        <span v-if="terms.length" class="muted small">
          {{ approvedCount }} of {{ terms.length }} approved
        </span>
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>

    <div class="split" :class="{ dragging }" :style="{ '--pdf-w': split + '%' }" ref="splitEl">
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

      <div
        class="handle"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-label="Resize the contract and terms panes"
        :aria-valuenow="Math.round(split)"
        :aria-valuemin="SPLIT_MIN"
        :aria-valuemax="SPLIT_MAX"
        title="Drag to resize · double-click to reset"
        @pointerdown="startDrag"
        @dblclick="resetSplit"
        @keydown.left.prevent="nudge(-2)"
        @keydown.right.prevent="nudge(2)"
        @keydown.home.prevent="resetSplit"
      ><span class="grip" aria-hidden="true" /></div>

      <div class="terms-pane">
        <div class="tabs" role="tablist" aria-label="Term categories">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="tab"
            :class="{ 'is-active': tab === t.key }"
            role="tab"
            type="button"
            :aria-selected="tab === t.key"
            @click="tab = t.key; selected = null"
          >
            {{ t.label }}
            <!-- Every tab shows the same kind of number: how many terms are in there. The
                 design system's filled pill was tried here for "most left to review" and read
                 as arbitrary — one circled figure among plain ones, saying 8 while the header
                 said 15, because they count different things. The attention figure belongs in
                 one place, labelled, and that is the header. -->
            <span class="tab__n" :title="`${t.count} terms`">{{ t.count }}</span>
          </button>
        </div>

        <div class="tbar">
          <!-- The compact search that belongs inside a toolbar, rather than a page-width bar. -->
          <div class="finder" :class="{ 'has-value': query }">
            <svg class="finder__ico" viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
            </svg>
            <input
              v-model="query"
              class="finder__in"
              type="search"
              autocomplete="off"
              spellcheck="false"
              placeholder="Search terms, amounts, wording…"
              aria-label="Search extracted terms"
            />
            <button class="finder__x" type="button" aria-label="Clear search" @click="query = ''">
              <svg viewBox="0 0 13 13" aria-hidden="true"><path d="M2 2 11 11M11 2 2 11" /></svg>
            </button>
          </div>
          <span class="muted small count">
            {{ shown.length }}<template v-if="query"> of {{ (counts[tab] || 0) }}</template>
          </span>
          <button
            v-if="canApprove && pendingInTab && !query"
            class="primary sm"
            :disabled="bulkBusy"
            @click="approveTab"
          >
            {{ bulkBusy ? 'Approving…' : `Approve all ${pendingInTab}` }}
          </button>
        </div>

        <!-- A match in another category is still a match; say so rather than letting the
             search look empty because the reader is standing in the wrong tab. -->
        <div v-if="query && hitsElsewhere.length" class="elsewhere">
          Also found in
          <button
            v-for="c in hitsElsewhere"
            :key="c.key"
            class="link"
            type="button"
            @click="tab = c.key; selected = null"
          >{{ c.label }} ({{ c.n }})</button>
        </div>

        <div class="tlist">
          <p v-if="!terms.length && !loaded" class="muted" style="padding: 20px">Loading…</p>
          <p v-else-if="!terms.length" class="muted" style="padding: 20px">
            No terms extracted yet — run extraction on this document.
          </p>
          <p v-else-if="!shown.length && query" class="muted" style="padding: 20px">
            Nothing here matches “{{ query }}”.
          </p>
          <p v-else-if="!shown.length" class="muted" style="padding: 20px">
            Nothing in this category for this agreement.
          </p>
          <TermTable
            v-else
            :terms="shown"
            :category="tab"
            :selected-id="selected?.record_id || null"
            :editable="canApprove"
            :catalog-options="catalog.options"
            :busy="busy"
            :draft="draft"
            :violated="violatedIds"
            @select="selectTerm"
            @approve="approveTerm"
            @edit="startEdit"
            @cancel="draft = null"
            @save="saveDraft"
            @link="linkTerm"
            @field="(k, v) => draft && (draft[k] = v)"
          />
        </div>
      </div>
    </div>

    <SidePanel
      :open="reviewOpen"
      title="Change verification"
      subtitle="What the re-uploaded agreement actually changed, against what the customer asked for."
      @close="reviewOpen = false"
    >
      <template v-if="review">
        <div v-if="review.requested" class="crask">
          <div class="label">Customer asked</div>
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
/* The shell's content column is already exactly the viewport height, so this fills it. The
   old `calc(100vh - 58px)` subtracted a top bar this layout does not have, which left a band
   of dead canvas under the split. */
.review { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.rhead { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); background: #fff; gap: 12px; }
.err { color: var(--risk); padding: 8px 20px; }
.small { font-size: 12px; }
.split { flex: 1; display: grid; grid-template-columns: var(--pdf-w, 42%) 7px 1fr; min-height: 0; }
/* While dragging, nothing under the pointer should select or swallow the move. */
.split.dragging { cursor: col-resize; user-select: none; }
.split.dragging .doc-pane, .split.dragging .terms-pane { pointer-events: none; }
.handle {
  position: relative; cursor: col-resize; background: var(--line);
  border: 0; padding: 0; border-radius: 0;
  transition: background 0.12s ease;
}
.handle:hover, .handle:focus-visible, .split.dragging .handle { background: var(--accent); outline: none; }
/* A wider invisible target than the visible rule, so the grab does not demand precision. */
.handle::before { content: ''; position: absolute; inset: 0 -5px; }
.grip {
  position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 3px; height: 34px; border-radius: 999px; background: var(--panel);
  opacity: 0; transition: opacity 0.12s ease;
}
.handle:hover .grip, .handle:focus-visible .grip, .split.dragging .grip { opacity: 0.9; }
.doc-pane { overflow-y: auto; background: #dfe6f0; padding: 16px; }
.page-wrap { position: relative; max-width: 720px; margin: 0 auto 16px; box-shadow: var(--shadow); background: #fff; }
.page-wrap img { display: block; width: 100%; }
.hl { position: absolute; background: rgba(246, 199, 68, 0.38); outline: 2px solid var(--accent); border-radius: 2px; animation: pulse 1.2s ease-in-out 2; }
@keyframes pulse { 0%,100% { background: rgba(246,199,68,0.28); } 50% { background: rgba(246,199,68,0.55); } }
.pageno { position: absolute; top: 6px; right: 8px; font-size: 11px; color: var(--muted); background: rgba(255,255,255,0.85); padding: 1px 6px; border-radius: 4px; }

.terms-pane { display: flex; flex-direction: column; min-height: 0; background: var(--bg); }
/* Ecosphere Tabs, section size — these switch a panel, not the whole view, so they take the
   plain `tabs` rule: equal-width, centred, underlined. The strip stays put while the list
   scrolls, because the categories are how you navigate. */
.tabs { display: flex; gap: 0; background: #fff; border-bottom: 1px solid var(--line); }
.tab { height: 40px; }
.tab {
  flex: 1; height: 42px;
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  /* The app gives every button a 10px radius and a panel fill. Both have to go here, or the
     underline curves up at its ends and the tab reads as a pressed key rather than a tab. */
  border: 0; border-radius: 0; background: none; padding: 0; cursor: pointer;
  font: 400 13px/1 var(--sans); color: var(--muted);
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  transition: color 0.12s ease, border-color 0.18s ease;
}
.tab:hover { color: var(--ink); background: none; border-color: transparent; border-bottom-color: transparent; }
.tab.is-active:hover { border-bottom-color: var(--accent); }
.tab.is-active { color: var(--ink); font-weight: 500; border-bottom-color: var(--accent); }
/* A plain figure for a neutral total; it goes accent on the tab you are in, so only the
   current count carries weight. Tabular figures keep a changing number from shifting its
   neighbour. */
.tab__n { font-size: 11.5px; color: var(--muted); font-variant-numeric: tabular-nums; }
.tab.is-active .tab__n { color: var(--accent); }

.tbar { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: #fff; }
.tbar .count { margin-left: auto; white-space: nowrap; font-variant-numeric: tabular-nums; }
/* Ecosphere's compact toolbar search. */
.finder {
  display: flex; align-items: center; flex: 1 1 auto; min-width: 140px; height: 36px;
  padding: 0 5px 0 0;
  border: 1px solid var(--line-strong); border-radius: 999px; background: var(--panel);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.finder:hover { border-color: var(--muted); }
.finder:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
.finder__ico {
  flex: 0 0 auto; width: 15px; height: 15px; margin: 0 8px 0 12px; color: var(--muted);
  fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round;
}
.finder:focus-within .finder__ico { color: var(--accent); }
.finder__in { flex: 1; min-width: 0; height: 100%; border: 0; background: none; font: inherit; font-size: 12.5px; color: var(--ink); }
.finder__in::placeholder { color: var(--muted); }
.finder__in:focus { outline: none; }
.finder__in::-webkit-search-cancel-button, .finder__in::-webkit-search-decoration { -webkit-appearance: none; display: none; }
/* Shown only when there is something to clear. */
.finder__x { display: none; place-items: center; flex: 0 0 auto; width: 24px; height: 24px; border: 0; border-radius: 999px; background: none; color: var(--muted); cursor: pointer; }
.finder.has-value .finder__x { display: grid; }
.finder__x:hover { color: var(--ink); background: var(--bg); }
.finder__x svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }
.elsewhere { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 14px; border-bottom: 1px solid var(--line); background: var(--panel); font-size: 12px; color: var(--muted); }
.elsewhere .link { background: none; border: 0; padding: 0; font: inherit; color: var(--accent-ink); font-weight: 600; cursor: pointer; }
.elsewhere .link:hover { text-decoration: underline; }
.tlist { flex: 1; overflow-y: auto; }

.crtrigger { display: inline-flex; align-items: center; gap: 8px; }
.crtrigger.hasflag { border-color: var(--warn); color: var(--warn); }
/* A count, not a state: filled rather than tinted, tabular figures, circular under two digits. */
.countbadge {
  min-width: 19px; height: 19px; padding: 0 5px; border-radius: 999px;
  background: var(--risk); color: #fff; font-size: 11px; line-height: 19px;
  font-weight: 600; text-align: center; font-variant-numeric: tabular-nums;
}
.countbadge.zero { background: var(--muted); }
/* Colour never marks alone: the term keeps a label beside it. */
.vterm { background: var(--warn-weak); color: var(--warn); padding: 1px 5px; border-radius: 6px; }
.crask { background: var(--panel-2); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.crask p { margin: 4px 0 0; font-style: italic; }
.croverall { margin: 0; font-size: 15px; line-height: 1.55; }
.cri { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.cri.flag { border-color: var(--warn); background: var(--warn-weak); }
.crhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
.crbody { font-size: 13px; line-height: 1.6; }
.crnote { color: var(--ink-soft); margin-top: 4px; }
@media (max-width: 820px) {
  .split { grid-template-columns: 1fr; }
  .handle { display: none; }
}
</style>
