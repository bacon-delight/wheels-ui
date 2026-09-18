<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ExtractionMeta from '../components/ExtractionMeta.vue'
import SidePanel from '../components/SidePanel.vue'
import TermCard from '../components/TermCard.vue'
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
  CATEGORIES.map((c) => ({
    ...c,
    count: counts.value[c.key] || 0,
    flagged: terms.value.some((t) => t.category === c.key && t.needs_review),
  })),
)
const shown = computed(() => terms.value.filter((t) => t.category === tab.value))
// Approval is demanded on pricing, which is where the money is. Requiring it on all three
// hundred records would mean nobody ever reaches the end.
const pendingPricing = computed(
  () => terms.value.filter((t) => t.category === 'pricing' && !t.approved).length,
)
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
const isViolated = (t) =>
  t.category === 'pricing' && violatedPrograms.value.has(bareService(t.record?.program))

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
  selected.value = selected.value?.record_id === t.record_id ? null : t
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
const saveTerm = (t, record) => patchTerm(t, { record, approved: true })

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
        <span v-if="pendingPricing" class="muted small">{{ pendingPricing }} priced terms to approve</span>
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

      <div class="terms-pane">
        <div class="tabs">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="tab"
            :class="{ on: tab === t.key }"
            type="button"
            @click="tab = t.key; selected = null"
          >
            {{ t.label }}
            <span class="tcount">{{ t.count }}</span>
            <span v-if="t.flagged" class="tdot" title="terms needing review" />
          </button>
        </div>

        <div class="tbar">
          <span class="muted small">{{ shown.length }} term{{ shown.length === 1 ? '' : 's' }}</span>
          <button
            v-if="canApprove && pendingInTab"
            class="primary sm"
            :disabled="bulkBusy"
            @click="approveTab"
          >
            {{ bulkBusy ? 'Approving…' : `Approve all ${pendingInTab}` }}
          </button>
        </div>

        <div class="tlist">
          <div v-for="t in shown" :key="t.record_id" :class="{ violated: isViolated(t) }">
            <TermCard
              :term="t"
              :selected="selected?.record_id === t.record_id"
              :editable="canApprove"
              :catalog-options="catalog.options"
              :busy="busy"
              @select="selectTerm"
              @approve="approveTerm"
              @save="saveTerm"
            />
          </div>

          <p v-if="!terms.length && !loaded" class="muted" style="padding: 20px">Loading…</p>
          <p v-else-if="!terms.length" class="muted" style="padding: 20px">
            No terms extracted yet — run extraction on this document.
          </p>
          <p v-else-if="!shown.length" class="muted" style="padding: 20px">
            Nothing in this category for this agreement.
          </p>
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
.review { height: calc(100vh - 58px); display: flex; flex-direction: column; }
.rhead { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); background: #fff; gap: 12px; }
.err { color: var(--risk); padding: 8px 20px; }
.small { font-size: 12px; }
.split { flex: 1; display: grid; grid-template-columns: 1.2fr 1fr; min-height: 0; }
.doc-pane { overflow-y: auto; background: #dfe6f0; padding: 16px; }
.page-wrap { position: relative; max-width: 720px; margin: 0 auto 16px; box-shadow: var(--shadow); background: #fff; }
.page-wrap img { display: block; width: 100%; }
.hl { position: absolute; background: rgba(246, 199, 68, 0.38); outline: 2px solid var(--accent); border-radius: 2px; animation: pulse 1.2s ease-in-out 2; }
@keyframes pulse { 0%,100% { background: rgba(246,199,68,0.28); } 50% { background: rgba(246,199,68,0.55); } }
.pageno { position: absolute; top: 6px; right: 8px; font-size: 11px; color: var(--muted); background: rgba(255,255,255,0.85); padding: 1px 6px; border-radius: 4px; }

.terms-pane { display: flex; flex-direction: column; min-height: 0; background: var(--bg); }
/* The tab strip stays put while the list scrolls: the categories are how you navigate. */
.tabs { display: flex; gap: 2px; padding: 8px 12px 0; background: #fff; border-bottom: 1px solid var(--line); }
.tab {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; border-bottom: 2px solid transparent;
  padding: 8px 12px 9px; cursor: pointer; font: inherit; font-size: 13px;
  color: var(--muted); font-weight: 500;
}
.tab:hover { color: var(--ink); }
.tab.on { color: var(--accent-ink); border-bottom-color: var(--accent); font-weight: 600; }
.tcount { font-size: 11px; color: var(--muted); background: var(--panel-2, #eef1f5); border-radius: 999px; padding: 1px 6px; font-variant-numeric: tabular-nums; }
.tab.on .tcount { background: var(--accent-weak); color: var(--accent-ink); }
.tdot { width: 6px; height: 6px; border-radius: 50%; background: var(--warn); }
.tbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--line); background: #fff; }
.tlist { flex: 1; overflow-y: auto; padding: 12px 14px; display: grid; gap: 8px; align-content: start; }
.violated :deep(.tcard) { border-left: 3px solid var(--warn); background: var(--warn-weak); }

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
@media (max-width: 820px) { .split { grid-template-columns: 1fr; } }
</style>
