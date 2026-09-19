<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import Dialog from '../components/Dialog.vue'
import { api } from '../services/api'
import { docLabel, money, useEngagementStore } from '../stores/engagement'

/**
 * The billing audit: what will be invoiced, beside the contract that says so.
 *
 * This is the last gate before an engagement goes live, and the question it answers is not
 * "are these terms right" — the customer has already signed them — but "is this what we are
 * about to charge". So the right-hand side is the generated billing configuration itself,
 * not a re-reading of the terms, and every line links back to the clause it was built from:
 * clicking a fee scrolls the contract to the sentence it came from and highlights it. A
 * number nobody can trace is a number nobody can approve.
 *
 * The arithmetic here deliberately mirrors `app/billing/estimate.py` line for line. If this
 * screen and the stored figure ever disagree, that is shown rather than reconciled away.
 */
const route = useRoute()
const router = useRouter()
const eng = useEngagementStore()
const eid = route.params.eid

const billing = ref(null)
const pagesByDoc = ref({})
const selected = ref(null)
const activeDoc = ref(null)
const loaded = ref(false)
const busy = ref('')
const err = ref('')
const showReject = ref(false)
const comment = ref('')
const pageEls = ref({})

// The same draggable split as the terms review, and the same remembered width: somebody who
// likes a wide contract pane likes it on both screens.
const SPLIT_KEY = 'wheels.review.split'
const SPLIT_DEFAULT = 42
const SPLIT_MIN = 22
const SPLIT_MAX = 72
function readSplit() {
  try {
    const saved = Number(localStorage.getItem(SPLIT_KEY))
    if (Number.isFinite(saved) && saved >= SPLIT_MIN && saved <= SPLIT_MAX) return saved
  } catch {
    /* blocked storage is not a reason to fail to render */
  }
  return SPLIT_DEFAULT
}
const split = ref(readSplit())
const dragging = ref(false)
const splitEl = ref(null)
const clamp = (n) => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n))
function persistSplit() {
  try {
    localStorage.setItem(SPLIT_KEY, String(Math.round(split.value)))
  } catch {
    /* a width that cannot be saved is still a width for this session */
  }
}
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
const nudge = (by) => {
  split.value = clamp(split.value + by)
  persistSplit()
}
const resetSplit = () => {
  split.value = SPLIT_DEFAULT
  persistSplit()
}

const config = computed(() => billing.value?.config)
const items = computed(() => config.value?.pricing_items || [])
const fleet = computed(() => billing.value?.fleet_size ?? 0)
const frequency = computed(() => billing.value?.frequency || 'monthly')
const MONTHS = { monthly: 1, quarterly: 3, annual: 12 }
const FREQ = { monthly: 'month', quarterly: 'quarter', annual: 'year' }
const months = computed(() => MONTHS[frequency.value] || 1)

const key = (it) => it.record_id || `${it.program}|${it.item}|${it.amount}`

// The one rule that decides whether a charge enters recurring dues, kept identical to the
// server's: a flat per-vehicle-per-month amount, plus whichever tier band this fleet falls in.
const PER_UNIT_MONTH = /per_(vehicle|unit).*month/
function bandFor(it) {
  return (it.tier_bands || []).find(
    (b) => fleet.value >= (b.min_units || 0) && (b.max_units == null || fleet.value <= b.max_units),
  )
}
function perUnit(it) {
  let n = 0
  if (it.amount != null && PER_UNIT_MONTH.test(it.unit_basis || '')) n += it.amount
  const band = bandFor(it)
  if (band?.amount != null) n += band.amount
  return n
}

// What an invoice is actually made of. Recurring charges multiply by the fleet and land on
// every invoice; everything else arrives only when something happens, and saying which is
// which is the difference between a breakdown and a list.
const recurring = computed(() =>
  items.value
    .map((it) => ({ ...it, per_unit: perUnit(it), band: bandFor(it) }))
    .filter((it) => it.per_unit > 0)
    .sort((a, b) => b.per_unit - a.per_unit),
)
const OUTSIDE = {
  usage: 'As incurred — per transaction, per card, per claim',
  recurring_per_driver: 'Per driver, per month',
  one_time: 'One-off',
  credit: 'Rebates and incentives owed to the customer',
}
const recurringIds = computed(() => new Set(recurring.value.map((it) => key(it))))
const separate = computed(() => {
  const out = {}
  for (const it of items.value) {
    if (recurringIds.value.has(key(it))) continue
    ;(out[it.billing_class || 'usage'] ||= []).push(it)
  }
  return Object.entries(out).map(([cls, rows]) => ({ cls, label: OUTSIDE[cls] || cls, rows }))
})

const perUnitTotal = computed(() => recurring.value.reduce((n, it) => n + it.per_unit, 0))
const monthlyTotal = computed(() => Math.round(perUnitTotal.value * fleet.value * 100) / 100)
const perInvoice = computed(() => monthlyTotal.value * months.value)
// What billing has actually stored, so a disagreement between this screen and what will be
// charged is visible rather than assumed away.
const stored = computed(() => billing.value?.monthly_recurring)
const drift = computed(
  () => stored.value != null && Math.abs(stored.value - monthlyTotal.value) > 0.01,
)
// A line the analyst never approved has no business billing. Worth naming before go-live.
const unapproved = computed(() => items.value.filter((it) => it.approved === false))

const schedule = computed(() => billing.value?.schedule || [])
const fmtDate = (iso) =>
  new Date(iso.slice(0, 10) + 'T00:00:00').toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  })

// One entry per agreement that contributed a fee — usually one, two when a lease and a
// service agreement both price things. A configuration generated before charges carried their
// source falls back to the agreements in force: no highlights, but still the contract.
const docs = computed(() => {
  const seen = new Map()
  for (const it of items.value) {
    if (!it.document_id || seen.has(it.document_id)) continue
    seen.set(it.document_id, {
      document_id: it.document_id,
      version: it.version,
      doc_type: it.doc_type,
    })
  }
  if (seen.size) return [...seen.values()]
  return eng.currentDocs
    .filter((d) => d.doc_type && d.doc_type !== 'UNKNOWN')
    .map((d) => ({ document_id: d.document_id, version: d.current_version, doc_type: d.doc_type }))
})
const pages = computed(() => pagesByDoc.value[activeDoc.value] || [])

async function loadPages(doc) {
  if (!doc || pagesByDoc.value[doc.document_id]) return
  try {
    const { data } = await api.get(
      `/engagements/${eid}/documents/${doc.document_id}/versions/${doc.version}/pages`,
    )
    pagesByDoc.value = { ...pagesByDoc.value, [doc.document_id]: data.pages || [] }
  } catch {
    // A contract we cannot render still has a billing config worth auditing; the pane says so.
    pagesByDoc.value = { ...pagesByDoc.value, [doc.document_id]: [] }
  }
}

async function load() {
  try {
    const { data } = await api.get(`/engagements/${eid}/billing`, {
      // Named explicitly: during an amendment the billing *in force* is the previous cycle,
      // and auditing that would be auditing something nobody changed.
      params: { submission_id: eng.submission?.submission_id },
    })
    billing.value = data
    activeDoc.value = docs.value[0]?.document_id || null
    await loadPages(docs.value[0])
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  } finally {
    loaded.value = true
  }
}
onMounted(async () => {
  if (!eng.data || eng.eid !== eid) await eng.load(eid)
  await load()
})
watch(activeDoc, (id) => loadPages(docs.value.find((d) => d.document_id === id)))

async function pick(it) {
  if (!it.citations?.length) return
  if (selected.value && key(selected.value) === key(it)) {
    selected.value = null
    return
  }
  selected.value = it
  const cite = it.citations[0]
  if (it.document_id && it.document_id !== activeDoc.value) {
    activeDoc.value = it.document_id
    await loadPages(docs.value.find((d) => d.document_id === it.document_id))
  }
  await nextTick()
  pageEls.value[cite.page]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
const highlightsOn = (n) =>
  selected.value?.document_id === activeDoc.value
    ? (selected.value?.citations || []).filter((c) => c.page === n && c.bbox)
    : []
const rectStyle = (b) => ({
  left: `${b.x0 * 100}%`,
  top: `${b.y0 * 100}%`,
  width: `${(b.x1 - b.x0) * 100}%`,
  height: `${(b.y1 - b.y0) * 100}%`,
})

async function approve() {
  busy.value = 'approve'
  err.value = ''
  try {
    await api.post(
      `/engagements/${eid}/submissions/${eng.submission.submission_id}:approve-billing`,
    )
    await eng.load(eid)
    router.push(`/engagements/${eid}/billing`)
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}
async function reject() {
  busy.value = 'reject'
  err.value = ''
  try {
    await api.post(
      `/engagements/${eid}/submissions/${eng.submission.submission_id}:audit-request-changes`,
      { comment: comment.value },
    )
    await eng.load(eid)
    router.push(`/engagements/${eid}`)
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
  showReject.value = false
}
</script>

<template>
  <div class="audit">
    <div class="rhead">
      <div class="row" style="gap: 12px; min-width: 0">
        <router-link :to="`/engagements/${eid}`" class="muted back">
          ← {{ eng.data?.engagement?.name || 'Engagement' }}
        </router-link>
        <h1>Billing audit</h1>
      </div>
      <div class="row" style="gap: 10px">
        <span class="muted small hide-sm">
          {{ recurring.length }} recurring · {{ fleet }} vehicles ·
          <strong>{{ money(monthlyTotal) }}</strong>/mo
        </span>
        <template v-if="eng.status === 'PENDING_BILLING_AUDIT'">
          <button class="ghost sm" :disabled="!!busy" @click="showReject = true">Request changes</button>
          <button class="primary sm" :disabled="!!busy" @click="approve">
            {{ busy === 'approve' ? 'Approving…' : 'Approve &amp; go live' }}
          </button>
        </template>
        <span v-else-if="eng.status === 'ACTIVE'" class="badge ok"><span class="dot" />Approved</span>
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>

    <div class="split" :class="{ dragging }" :style="{ '--pdf-w': split + '%' }" ref="splitEl">
      <div class="doc-pane">
        <div v-if="docs.length > 1" class="docbar">
          <button
            v-for="d in docs"
            :key="d.document_id"
            type="button"
            class="dtab"
            :class="{ on: activeDoc === d.document_id }"
            @click="activeDoc = d.document_id"
          >{{ docLabel(d.doc_type) }}</button>
        </div>
        <div
          v-for="p in pages"
          :key="p.page"
          class="page-wrap"
          :ref="(el) => (pageEls[p.page] = el)"
        >
          <img :src="p.image_url" :alt="`page ${p.page}`" loading="lazy" />
          <div v-for="(c, i) in highlightsOn(p.page)" :key="i" class="hl" :style="rectStyle(c.bbox)" />
          <div class="pageno">Page {{ p.page }}</div>
        </div>
        <p v-if="!pages.length" class="muted" style="padding: 20px">
          {{ loaded ? 'No rendered pages for this agreement.' : 'Loading the contract…' }}
        </p>
      </div>

      <div
        class="handle"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-label="Resize the contract and billing panes"
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

      <div class="bill-pane">
        <div v-if="!config && loaded" class="card pad">
          <h2>Nothing to audit yet</h2>
          <p class="muted" style="margin: 0">
            The billing configuration has not been generated for this cycle.
          </p>
        </div>

        <template v-else-if="config">
          <div class="invoice">
            <div class="label">What one invoice comes to</div>
            <div class="total">{{ money(perInvoice) }}<span class="per">/{{ FREQ[frequency] }}</span></div>
            <div class="muted small">
              {{ money(perUnitTotal) }} per vehicle per month × {{ fleet }} vehicles =
              {{ money(monthlyTotal) }} a month<template v-if="months > 1">, billed every {{ months }} months</template>.
            </div>
            <!-- If this screen and the stored figure disagree, the stored one is what bills. -->
            <p v-if="drift" class="flag warn">
              This adds up to {{ money(monthlyTotal) }} a month, but billing has
              {{ money(stored) }} stored. Send it back rather than approving.
            </p>
            <p v-if="unapproved.length" class="flag warn">
              {{ unapproved.length }} priced line{{ unapproved.length === 1 ? '' : 's' }}
              reached billing without being approved in review.
            </p>
          </div>

          <section>
            <div class="shead">
              <h3>On every invoice</h3>
              <span class="muted small">per vehicle, per month</span>
            </div>
            <p class="muted small note">Click a charge to see the clause it was read from.</p>
            <button
              v-for="it in recurring"
              :key="key(it)"
              type="button"
              class="line"
              :class="{ sel: selected && key(selected) === key(it), nocite: !it.citations?.length }"
              @click="pick(it)"
            >
              <span class="lmain">
                <span class="ltitle">{{ it.description || it.item || it.program }}</span>
                <span class="muted lsub">
                  {{ it.program }}
                  <template v-if="it.band"> · band {{ it.band.min_units }}–{{ it.band.max_units ?? '∞' }} vehicles</template>
                  <template v-else-if="it.frequency"> · {{ it.frequency }}</template>
                </span>
              </span>
              <span class="lrate muted">{{ money(it.per_unit) }} × {{ fleet }}</span>
              <span class="lamt">{{ money(it.per_unit * fleet) }}</span>
            </button>
            <p v-if="!recurring.length && loaded" class="muted note">
              Nothing recurring — this agreement charges only as things happen.
            </p>
            <div class="sum">
              <span>Monthly recurring</span>
              <strong>{{ money(monthlyTotal) }}</strong>
            </div>
          </section>

          <section v-if="separate.length">
            <div class="shead">
              <h3>Billed separately</h3>
              <span class="muted small">not in the figure above</span>
            </div>
            <p class="muted small note">
              Charged when they happen, so no fleet count applies to them.
            </p>
            <div v-for="g in separate" :key="g.cls" class="group">
              <div class="glabel">{{ g.label }} <span class="muted">· {{ g.rows.length }}</span></div>
              <button
                v-for="it in g.rows"
                :key="key(it)"
                type="button"
                class="line thin"
                :class="{ sel: selected && key(selected) === key(it), nocite: !it.citations?.length }"
                @click="pick(it)"
              >
                <span class="lmain">
                  <span class="ltitle">{{ it.description || it.item || it.program }}</span>
                  <span class="muted lsub">{{ it.program }}<template v-if="it.frequency"> · {{ it.frequency }}</template></span>
                </span>
                <span class="lamt muted">
                  <template v-if="it.amount != null">{{ money(it.amount) }}</template>
                  <template v-else-if="it.rate_pct != null">{{ it.rate_pct }}%</template>
                  <template v-else-if="it.tier_bands?.length">tiered</template>
                  <template v-else>—</template>
                </span>
              </button>
            </div>
          </section>

          <section v-if="schedule.length">
            <div class="shead">
              <h3>When it is collected</h3>
              <span class="muted small">{{ schedule.length }} installments</span>
            </div>
            <p class="muted small note">
              Generated from the billing start date. Each installment is
              {{ months }} × {{ money(monthlyTotal) }}.
            </p>
            <div class="twrap">
              <table class="sched">
                <tbody>
                  <tr v-for="row in schedule.slice(0, 6)" :key="row.seq">
                    <td>{{ row.label }}</td>
                    <td class="muted">{{ fmtDate(row.due_date) }}</td>
                    <td class="r">{{ money(row.amount) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="schedule.length > 6" class="muted small note" style="margin-bottom: 0">
              and {{ schedule.length - 6 }} more.
            </p>
          </section>

          <section v-if="config.excluded_services?.length">
            <div class="shead"><h3>Not in this agreement</h3></div>
            <p class="muted small note">
              {{ config.excluded_services.slice(0, 12).join(', ')
              }}<template v-if="config.excluded_services.length > 12">
                and {{ config.excluded_services.length - 12 }} more</template>.
            </p>
          </section>
        </template>
      </div>
    </div>

    <Dialog
      :open="showReject"
      title="Send the billing back"
      subtitle="The engagement returns to review so the terms behind these charges can be corrected."
      @close="showReject = false"
    >
      <label class="fld">
        <span class="label">What needs changing?</span>
        <textarea
          v-model="comment"
          rows="4"
          placeholder="The maintenance fee is billing per vehicle but the contract says per driver…"
        />
      </label>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="showReject = false">Cancel</button>
        <button class="primary" :disabled="!comment.trim() || !!busy" @click="reject">
          {{ busy === 'reject' ? 'Sending…' : 'Send back' }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.audit { height: 100%; min-height: 0; display: flex; flex-direction: column; }
.rhead { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); background: #fff; gap: 12px; }
.rhead h1 { margin: 0; font-size: 17px; }
.back { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 30ch; }
.err { color: var(--risk); padding: 8px 20px; }
.small { font-size: 12px; }

.split { flex: 1; display: grid; grid-template-columns: var(--pdf-w, 42%) 7px 1fr; min-height: 0; }
.split.dragging { cursor: col-resize; user-select: none; }
.split.dragging .doc-pane, .split.dragging .bill-pane { pointer-events: none; }
.handle { position: relative; cursor: col-resize; background: var(--line); border: 0; padding: 0; border-radius: 0; transition: background 0.12s ease; }
.handle:hover, .handle:focus-visible, .split.dragging .handle { background: var(--accent); outline: none; }
.handle::before { content: ''; position: absolute; inset: 0 -5px; }
.grip { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 3px; height: 34px; border-radius: 999px; background: var(--panel); opacity: 0; transition: opacity 0.12s ease; }
.handle:hover .grip, .handle:focus-visible .grip, .split.dragging .grip { opacity: 0.9; }

.doc-pane { overflow-y: auto; background: #dfe6f0; padding: 16px; }
.docbar { display: flex; gap: 6px; max-width: 720px; margin: 0 auto 12px; }
.dtab { padding: 5px 12px; font-size: 12.5px; border-radius: 999px; background: rgba(255, 255, 255, 0.7); border: 1px solid transparent; }
.dtab.on { background: #fff; border-color: var(--accent); font-weight: 600; }
.page-wrap { position: relative; max-width: 720px; margin: 0 auto 16px; box-shadow: var(--shadow); background: #fff; }
.page-wrap img { display: block; width: 100%; }
.hl { position: absolute; background: rgba(246, 199, 68, 0.38); outline: 2px solid var(--accent); border-radius: 2px; }
.pageno { position: absolute; top: 6px; right: 8px; font-size: 11px; color: var(--muted); background: rgba(255, 255, 255, 0.85); padding: 1px 6px; border-radius: 4px; }

.bill-pane { overflow-y: auto; background: var(--bg); padding: 18px 20px 48px; }
.pad { padding: 20px 22px; }
.invoice { background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--accent); border-radius: 14px; padding: 16px 18px; margin-bottom: 20px; }
.total { font-family: var(--serif); font-size: 34px; font-weight: 600; line-height: 1.1; margin: 2px 0 4px; }
.per { font-size: 16px; font-family: var(--sans); color: var(--muted); margin-left: 4px; }
.flag { margin: 10px 0 0; padding: 9px 12px; border-radius: 9px; font-size: 12.5px; }
.flag.warn { background: var(--warn-weak, #f9efdd); color: var(--warn); }

section { margin-bottom: 24px; }
.shead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
.shead h3 { margin: 0; font-size: 13px; font-weight: 600; }
.note { margin: 4px 0 10px; }
.group { margin-bottom: 10px; }
.glabel { font-size: 12px; font-weight: 600; color: var(--ink-soft); margin: 10px 0 2px; }

/* Each component is a control, because clicking it moves the contract beside it. */
.line {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: baseline;
  width: 100%; text-align: left; background: none; border: 1px solid transparent;
  border-bottom: 1px solid var(--line); border-radius: 0; padding: 9px 8px; font: inherit; color: inherit;
}
.line:hover { background: var(--panel); border-bottom-color: var(--line); }
.line.sel { background: var(--accent-weak); border-color: var(--accent); border-radius: 9px; }
/* A charge with no citation cannot be checked against the page; it should not look clickable. */
.line.nocite { cursor: default; opacity: 0.82; }
.line.thin { grid-template-columns: minmax(0, 1fr) auto; }
.lmain { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.ltitle { font-weight: 500; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lsub { font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lrate { font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lamt { font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sum { display: flex; justify-content: space-between; padding: 11px 8px 0; font-size: 14px; }

.twrap { overflow-x: auto; }
.sched { width: 100%; border-collapse: collapse; }
.sched td { padding: 8px; border-top: 1px solid var(--line); font-size: 13px; }
.sched tr:first-child td { border-top: none; }
.sched .r { text-align: right; font-variant-numeric: tabular-nums; }
.fld { display: flex; flex-direction: column; gap: 6px; }
@media (max-width: 900px) { .hide-sm { display: none; } }
</style>
