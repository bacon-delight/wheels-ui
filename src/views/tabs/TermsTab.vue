<script setup>
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useRoute } from 'vue-router'

import ChangeReviewPanel from '../../components/ChangeReviewPanel.vue'
import Dialog from '../../components/Dialog.vue'
import { api } from '../../services/api'
import { docLabel, estimateMonthly, feeLine, money, prettyService, useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eid = route.params.eid
const eng = useEngagementStore()

// client
const view = ref('documents') // documents | summary
const docPages = ref({}) // document_id -> [pages]
const mode = ref('idle') // idle | sign | changes
const sigName = ref('')
const sigPlace = ref('')
const changeComment = ref('')
// provider change-loop
const changeNote = ref('')
const rejectNote = ref('')

// provider: fleet size (finalized during approval, locked once billing is active)
const fleetInput = ref(100)
const savingFleet = ref(false)
const canSetFleet = computed(
  () => eng.isProvider && eng.reviewable && !['BILLING_SETUP', 'ACTIVE'].includes(eng.status),
)
const electedLines = computed(() =>
  eng.clientTerms.flatMap((g) => g.fields.filter((f) => f.elected).map((f) => ({ fee_items: f.fee_items }))),
)
const estMonthly = computed(() => estimateMonthly(electedLines.value, fleetInput.value))
// Clearing the override hands the number back to the vehicle inventory.
async function useInventoryCount() {
  savingFleet.value = true
  try {
    await api.patch(`/engagements/${eid}/billing`, { fleet_size: null })
    await eng.load(eid)
  } catch {
    /* ignore; server reconciles on next load */
  }
  savingFleet.value = false
}
watchEffect(() => {
  const fs = eng.data?.engagement?.fleet_size
  if (fs != null) fleetInput.value = fs
})
async function saveFleet() {
  savingFleet.value = true
  try {
    await api.patch(`/engagements/${eid}/billing`, { fleet_size: Math.max(1, Number(fleetInput.value) || 1) })
    await eng.load(eid)
  } catch {
    /* ignore; server reconciles on next load */
  }
  savingFleet.value = false
}

// provider: finance validation (a deliberate, independent gate — nothing is pre-approved)
const financeMode = ref('idle') // idle | changes
const financeChecked = ref(false)
const financeComment = ref('')
async function financeApprove() {
  await eng.action('finance-approve')
}
async function financeReject() {
  await eng.action('finance-request-changes', { comment: financeComment.value })
  financeMode.value = 'idle'
  financeComment.value = ''
}

function onUpload(e) {
  const files = e.target.files
  if (files?.length) eng.uploadFiles(files)
  e.target.value = ''
}
// Naming the document marks this as a revision of that agreement rather than another one.
function onReplace(documentId, e) {
  const f = e.target.files?.[0]
  if (f) {
    eng.uploadFiles([f], documentId)
  }
  e.target.value = ''
}
// Removing an agreement destroys its extracted terms too, so it asks first.
const pendingRemoval = ref(null)
const canRemove = computed(() =>
  eng.isProvider &&
  ['DRAFT', 'IN_UNDERWRITING', 'VALIDATION_FAILED', 'CHANGES_REQUESTED_CLIENT'].includes(eng.status),
)
async function confirmRemove() {
  const doc = pendingRemoval.value
  pendingRemoval.value = null
  if (doc) await eng.removeDocument(doc.document_id)
}

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null

async function approveSign() {
  await eng.action('client-approve', { signature: { full_name: sigName.value.trim(), place: sigPlace.value.trim() } })
  mode.value = 'idle'
}
async function sendChanges() {
  await eng.action('client-request-changes', { comment: changeComment.value })
  mode.value = 'idle'
  changeComment.value = ''
}
const hasTerms = () => eng.clientTerms.some((g) => g.fields.length)

async function loadPages() {
  for (const g of eng.clientTerms) {
    if (docPages.value[g.document_id]) continue
    try {
      const r = await api.get(`/engagements/${eid}/documents/${g.document_id}/versions/${g.version}/pages`)
      docPages.value = { ...docPages.value, [g.document_id]: r.data.pages }
    } catch {
      /* ignore */
    }
  }
}
onMounted(() => {
  if (!eng.isProvider) loadPages()
})
</script>

<template>
  <!-- ============ PROVIDER ============ -->
  <div v-if="eng.isProvider" class="stack">
    <div class="card pad">
      <div class="spread" style="align-items: flex-start">
        <div>
          <h2 style="margin: 0">Agreements</h2>
          <p class="muted small" style="margin: 6px 0 0; max-width: 62ch">
            Upload whatever you have. We read each document to tell a lease agreement from a
            service one, and the newest of each type is the one in force.
          </p>
        </div>
        <label v-if="eng.isProvider && ['DRAFT', 'IN_UNDERWRITING'].includes(eng.status)" class="primary btn-file">
          ＋ Upload agreements
          <input type="file" accept="application/pdf" multiple hidden @change="onUpload" />
        </label>
      </div>

      <p v-if="eng.busy === 'upload'" class="muted small" style="margin-top: 10px">Uploading…</p>

      <div class="docs">
        <div v-for="d in eng.currentDocs" :key="d.document_id" class="doc">
          <div class="dinfo">
            <div class="row" style="gap: 8px">
              <strong>{{ d.doc_type === 'UNKNOWN' ? 'Unclassified' : d.doc_type }}</strong>
              <!-- An unclassified document governs nothing until we know what it is. -->
              <span v-if="d.doc_type !== 'UNKNOWN'" class="badge ok"><span class="dot" />In force</span>
              <span v-else-if="d.classified_type" class="badge warn"><span class="dot" />Not an MLA or MSA</span>
              <span v-else class="badge info"><span class="dot" />Type pending</span>
              <span class="muted small">{{ d.filename }}</span>
            </div>
            <div class="muted small">
              <template v-if="d.doc_type !== 'UNKNOWN'">{{ docLabel(d.doc_type) }}</template>
              <template v-else-if="d.classified_type">Read, but it does not identify itself as a lease or service agreement, so it carries no billing terms.</template>
              <template v-else>Its type is identified when you run extraction.</template>
              <span v-if="fmtDate(d.effective_date)"> · effective {{ fmtDate(d.effective_date) }}</span>
              <span v-if="d.current_version > 1"> · revision {{ d.current_version }}</span>
            </div>
            <div v-if="d.review?.total && eng.reviewable" class="prog">
              <div class="bar"><div class="fill" :class="{ done: d.review.pct === 100 }" :style="{ width: d.review.pct + '%' }" /></div>
              <span class="small" :class="d.review.pct === 100 ? 'okc' : 'muted'">{{ d.review.pct }}% reviewed ({{ d.review.approved }}/{{ d.review.total }})</span>
            </div>
          </div>
          <div class="row">
            <span v-if="['EXTRACTING', 'REVALIDATING'].includes(eng.status) && d.needs_extraction" class="muted small">reading…</span>
            <button
              v-else-if="eng.isProvider && d.needs_extraction"
              class="primary sm"
              :disabled="!!eng.busy"
              @click="eng.extractDocument(d.document_id)"
            >{{ eng.busy === `extract-${d.document_id}` ? 'Starting…' : 'Extract' }}</button>
            <router-link v-if="eng.reviewable && d.doc_type !== 'UNKNOWN'" class="btn-link" :to="`/engagements/${eid}/documents/${d.document_id}/v/${d.current_version}/review`">Review</router-link>
            <label v-if="eng.isProvider && ['DRAFT', 'IN_UNDERWRITING'].includes(eng.status)" class="btn-link">
              Replace<input type="file" accept="application/pdf" hidden @change="(e) => onReplace(d.document_id, e)" />
            </label>
            <button
              v-if="canRemove"
              class="ghost sm danger"
              :disabled="!!eng.busy"
              @click="pendingRemoval = d"
            >{{ eng.busy === `remove-${d.document_id}` ? 'Removing…' : 'Remove' }}</button>
          </div>
        </div>
        <p v-if="!eng.currentDocs.length" class="muted small" style="padding: 8px 0">No agreements uploaded yet.</p>
      </div>

      <!-- Superseded agreements came with the engagement for the record; they never feed
           terms, extraction or billing. -->
      <details v-if="eng.supersededDocs.length" class="prior">
        <summary>{{ eng.supersededDocs.length }} superseded agreement{{ eng.supersededDocs.length === 1 ? '' : 's' }} on file</summary>
        <div v-for="d in eng.supersededDocs" :key="d.document_id" class="doc">
          <div class="dinfo">
            <div class="row" style="gap: 8px">
              <strong>{{ d.doc_type === 'UNKNOWN' ? 'Unclassified' : d.doc_type }}</strong>
              <span class="pill off-pill">Superseded</span>
              <span class="muted small">{{ d.filename }}</span>
            </div>
            <div class="muted small">
              <span v-if="fmtDate(d.effective_date)">effective {{ fmtDate(d.effective_date) }}</span>
              <span v-else>no effective date found</span>
              · kept for the record, not billed
            </div>
          </div>
          <button
            v-if="canRemove"
            class="ghost sm danger"
            :disabled="!!eng.busy"
            @click="pendingRemoval = d"
          >Remove</button>
        </div>
      </details>

      <p v-if="!eng.currentDocs.length" class="muted small" style="margin-top: 12px">Upload an agreement to get started.</p>
      <p v-else-if="eng.pendingDocs.length && !['EXTRACTING', 'REVALIDATING'].includes(eng.status)" class="muted small" style="margin-top: 12px">
        {{ eng.pendingDocs.length }} agreement{{ eng.pendingDocs.length === 1 ? '' : 's' }} still to read. Extraction runs per agreement, so the ones already read keep their reviewed terms.
      </p>
      <p v-if="eng.status === 'EXTRACTING' || eng.status === 'REVALIDATING'" class="muted small" style="margin-top: 10px">Processing — parsing pages and pulling billing terms with Claude. Refresh in a moment.</p>
      <p v-if="eng.status === 'IN_UNDERWRITING'" class="muted small" style="margin-top: 12px">Wrong file, or a re-upload that didn’t reflect the change requested? Hit <strong>Replace</strong> above, then <strong>Extract</strong> that agreement.</p>
    </div>

    <Dialog
      :open="!!pendingRemoval"
      title="Remove this agreement?"
      :subtitle="pendingRemoval ? `${pendingRemoval.filename} and every term extracted from it will be deleted. This cannot be undone.` : ''"
      @close="pendingRemoval = null"
    >
      <p class="muted small" style="margin: 0">
        The engagement's scope is recalculated from the agreements that remain.
      </p>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="pendingRemoval = null">Cancel</button>
        <button class="primary danger-btn" @click="confirmRemove">Remove agreement</button>
      </template>
    </Dialog>

    <!-- Change verification: did the re-uploaded terms reflect the customer's request? -->
    <ChangeReviewPanel v-if="eng.submission && eng.reviewable" :eid="eid" :sid="eng.submission.submission_id" :status="eng.status" />

    <!-- Fleet size — finalized during approval, drives recurring dues -->
    <div class="card pad" v-if="canSetFleet && hasTerms()">
      <div class="spread" style="align-items: flex-start">
        <div>
          <h2 style="margin: 0">Fleet size</h2>
          <p class="muted small" style="margin: 6px 0 0; max-width: 470px">Vehicles under management. This follows the inventory by default — {{ eng.assignedVehicleCount }} assigned to this engagement. Type a number to override it. Locks once billing is set up.</p>
        </div>
        <label class="fleetset"><span class="label">Vehicles {{ savingFleet ? '· saving…' : '' }}</span><input type="number" min="1" v-model.number="fleetInput" @change="saveFleet" /></label>
      </div>
      <div class="row" style="margin-top: 10px; gap: 8px">
        <span class="badge" :class="eng.fleetSizeSource === 'override' ? 'warn' : 'ok'"><span class="dot" />{{ eng.fleetSizeSource === 'override' ? 'Manual override' : 'From inventory' }}</span>
        <router-link class="btn-link" :to="`/engagements/${eid}/vehicles`">{{ eng.assignedVehicleCount }} assigned</router-link>
        <button v-if="eng.fleetSizeSource === 'override'" class="ghost sm" :disabled="savingFleet" @click="useInventoryCount">Use inventory count</button>
      </div>
      <div class="estline">Estimated recurring <strong>{{ money(estMonthly) }}</strong>/mo <span class="muted">at {{ fleetInput }} vehicles</span></div>
    </div>

    <!-- Proposed terms summary (analyst + finance visibility) -->
    <div class="card pad" v-if="hasTerms() && eng.reviewable">
      <h2>Proposed terms</h2>
      <p class="muted small" style="margin: -6px 0 10px">Open <strong>Review</strong> on an agreement above to see the source or correct a value.</p>
      <div v-for="grp in eng.clientTerms" :key="grp.document_id" class="termgrp">
        <div class="tg">{{ docLabel(grp.doc_type) }}</div>
        <div v-for="f in grp.fields.filter((x) => x.elected)" :key="f.field_id" class="term">
          <strong>{{ prettyService(f.service) }}</strong>
          <ul class="fees">
            <li v-for="(fi, i) in f.fee_items" :key="i">
              <span v-if="feeLine(fi)" class="val">{{ feeLine(fi) }}</span>
              <span v-if="fi.description" class="muted"> {{ feeLine(fi) ? '— ' : '' }}{{ fi.description }}</span>
              <ul v-if="fi.tier_bands?.length" class="tiers"><li v-for="(t, j) in fi.tier_bands" :key="j">units {{ t.min_units }}–{{ t.max_units ?? '∞' }}: {{ money(t.amount) }}</li></ul>
            </li>
          </ul>
          <div v-if="f.citations?.length" class="cite muted small">📄 p{{ f.citations[0].page }}<span v-if="f.citations[0].section_label"> · {{ f.citations[0].section_label }}</span></div>
        </div>
      </div>
    </div>

    <!-- Next-step actions -->
    <div class="card pad" v-if="['IN_UNDERWRITING', 'FINANCE_APPROVED'].includes(eng.status)">
      <h2>Next step</h2>
      <div v-if="eng.status === 'IN_UNDERWRITING'">
        <!-- Nothing was recognised as an agreement, so there are no terms to approve. Saying
             "approve all 0 terms" would send someone looking for a Review link that cannot
             exist; the honest answer is that no agreement has been identified yet. -->
        <template v-if="!eng.reviewDocs.length">
          <p style="margin: 0 0 12px">
            No lease or service agreement has been identified on this engagement, so there are
            no billing terms to review.
          </p>
          <p class="muted small" style="margin: 0">
            {{ eng.currentDocs.length ? 'The documents uploaded do not identify themselves as a Master Lease Agreement or a Master Service Agreement — a statement of work or an amendment will read this way.' : 'Nothing has been uploaded yet.' }}
            Upload the agreement itself, and it will be read and its terms pulled out.
          </p>
        </template>
        <template v-else>
          <button class="primary" :disabled="!!eng.busy || !eng.allApproved" @click="eng.action('submit-to-client')">{{ eng.busy === 'submit-to-client' ? 'Submitting…' : 'Submit terms to customer' }}</button>
          <p v-if="!eng.allApproved" class="muted small" style="margin-top: 8px">Approve all {{ eng.totalTerms }} terms first — {{ eng.approvedTerms }}/{{ eng.totalTerms }} approved. Open each agreement's <strong>Review</strong> and click “Approve all”.</p>
        </template>
      </div>
      <button v-else-if="eng.status === 'FINANCE_APPROVED'" class="primary" :disabled="!!eng.busy" @click="eng.action('setup-billing')">{{ eng.busy === 'setup-billing' ? 'Generating…' : 'Set up billing' }}</button>
    </div>

    <!-- Finance validation: an independent review after the customer accepts (never pre-approved) -->
    <div class="card pad finance" v-if="eng.status === 'PENDING_FINANCE_APPROVAL'">
      <div class="spread" style="align-items: flex-start; margin-bottom: 4px">
        <h2 style="margin: 0">Finance validation</h2>
        <span class="badge info">Independent review</span>
      </div>
      <p class="muted small" style="margin: 0 0 12px; max-width: 620px">
        The customer has accepted these terms. Finance must independently review and validate them before billing is set up — approval is never automatic. Review the proposed terms above and the <router-link :to="{ name: 'eng-summary', params: { eid } }">negotiation summary</router-link>.
      </p>
      <div v-if="financeMode === 'idle'" class="stack" style="gap: 12px">
        <label class="ack"><input type="checkbox" v-model="financeChecked" /> I have independently reviewed the customer-approved terms and confirm they are correct.</label>
        <div class="row">
          <button class="primary" :disabled="!financeChecked || !!eng.busy" @click="financeApprove">{{ eng.busy === 'finance-approve' ? 'Approving…' : 'Approve terms (finance)' }}</button>
          <button :disabled="!!eng.busy" @click="financeMode = 'changes'">Request changes</button>
        </div>
      </div>
      <div v-else class="stack" style="gap: 10px">
        <textarea v-model="financeComment" rows="3" placeholder="What must change before billing can be set up?" />
        <div class="row">
          <button class="primary" :disabled="!financeComment.trim() || !!eng.busy" @click="financeReject">{{ eng.busy === 'finance-request-changes' ? 'Sending…' : 'Send back for changes' }}</button>
          <button :disabled="!!eng.busy" @click="financeMode = 'idle'">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Customer requested changes -->
    <div class="card pad" v-if="eng.status === 'CHANGES_REQUESTED_CLIENT'">
      <h2>Customer requested changes</h2>
      <p class="req">“{{ eng.submission?.latest_comment || 'The customer asked for changes.' }}”</p>
      <div class="opts">
        <div class="opt">
          <strong>Re-upload the updated agreement</strong>
          <p class="muted small">Upload a revised document, add a note for the customer, then re-validate.</p>
          <div class="row">
            <label class="btn-link">Upload revised agreement<input type="file" accept="application/pdf" multiple hidden @change="onUpload" /></label>
            <span v-if="eng.busy?.startsWith('upload')" class="muted small">uploading…</span>
          </div>
          <textarea v-model="changeNote" rows="2" placeholder="Note to the client about what changed…" style="margin-top: 10px" />
          <button class="primary" style="margin-top: 8px" :disabled="!!eng.busy" @click="eng.action('reupload', { comment: changeNote })">{{ eng.busy === 'reupload' ? 'Re-validating…' : 'Re-validate & resubmit' }}</button>
        </div>
        <div class="opt">
          <strong>Or respond without changes</strong>
          <p class="muted small">Explain why the terms stand, and send it back for approval.</p>
          <textarea v-model="rejectNote" rows="2" placeholder="Your response to the client…" style="margin-top: 10px" />
          <button style="margin-top: 8px" :disabled="!!eng.busy || !rejectNote.trim()" @click="eng.action('resubmit-to-client', { comment: rejectNote })">{{ eng.busy === 'resubmit-to-client' ? 'Sending…' : 'Reject request & resubmit' }}</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ CLIENT ============ -->
  <div v-else class="stack">
    <div class="card pad">
      <div class="spread" style="align-items: flex-start">
        <div>
          <h2 style="margin: 0">Billing terms for your review</h2>
          <p class="muted small" v-if="eng.status === 'PENDING_CLIENT_APPROVAL'" style="margin: 6px 0 0; max-width: 620px">
            These are the terms your provider has proposed, shown against the source contracts. Switch to the summary for a plain-language list, then approve or request changes.
          </p>
        </div>
        <button class="sm" v-if="hasTerms()" @click="view = view === 'documents' ? 'summary' : 'documents'">
          {{ view === 'documents' ? 'View summary' : 'View documents' }}
        </button>
      </div>
    </div>

    <!-- Provider's response to a change request -->
    <div class="card pad response" v-if="eng.status === 'PENDING_CLIENT_APPROVAL' && eng.submission?.latest_comment">
      <div class="rhead">💬 Response from {{ eng.submission?.latest_comment_by || 'your provider' }}</div>
      <p class="rbody">“{{ eng.submission.latest_comment }}”</p>
      <p class="muted small" style="margin: 8px 0 0">Please review the updated terms below, then approve or request further changes.</p>
    </div>

    <template v-if="!hasTerms()">
      <div class="card pad"><p class="muted" style="margin: 0">{{ eng.clientMessage }}</p></div>
    </template>

    <!-- Documents (PDF) view -->
    <template v-else-if="view === 'documents'">
      <div v-for="g in eng.clientTerms" :key="g.document_id" class="card pad">
        <h3 class="dtitle">{{ docLabel(g.doc_type) }}</h3>
        <div class="pdf">
          <div v-for="p in docPages[g.document_id] || []" :key="p.page" class="page-wrap">
            <img :src="p.image_url" :alt="`page ${p.page}`" loading="lazy" />
            <div class="pageno">Page {{ p.page }}</div>
          </div>
          <p v-if="!(docPages[g.document_id] || []).length" class="muted small" style="padding: 20px">Loading document…</p>
        </div>
      </div>
    </template>

    <!-- Summary view -->
    <template v-else>
      <div class="card pad">
        <div v-for="grp in eng.clientTerms" :key="grp.document_id" class="termgrp">
          <div class="tg">{{ docLabel(grp.doc_type) }}</div>
          <div v-for="f in grp.fields" :key="f.field_id" class="term">
            <strong>{{ prettyService(f.service) }}</strong>
            <ul class="fees">
              <li v-for="(fi, i) in f.fee_items" :key="i">
                <span v-if="feeLine(fi)" class="val">{{ feeLine(fi) }}</span>
                <span v-if="fi.description" class="muted"> {{ feeLine(fi) ? '— ' : '' }}{{ fi.description }}</span>
                <ul v-if="fi.tier_bands?.length" class="tiers"><li v-for="(t, j) in fi.tier_bands" :key="j">units {{ t.min_units }}–{{ t.max_units ?? '∞' }}: {{ money(t.amount) }}</li></ul>
                <div v-for="(c, k) in fi.conditions || []" :key="k" class="cond">⚑ {{ c.description }}</div>
              </li>
            </ul>
            <div v-if="f.citations?.length" class="cite muted small">📄 p{{ f.citations[0].page }}<span v-if="f.citations[0].section_label"> · {{ f.citations[0].section_label }}</span></div>
          </div>
        </div>
      </div>
    </template>

    <!-- Decision -->
    <div class="card pad" v-if="eng.status === 'PENDING_CLIENT_APPROVAL'">
      <h2>Your decision</h2>
      <div v-if="mode === 'idle'" class="row">
        <button class="primary" @click="mode = 'sign'">Approve terms</button>
        <button @click="mode = 'changes'">Request changes</button>
      </div>
      <div v-else-if="mode === 'sign'" class="stack" style="gap: 12px">
        <p class="muted small" style="margin: 0">Type your full legal name to sign. This acts as your electronic signature, recorded with the date and place.</p>
        <label class="fld"><span class="label">Full name (signature)</span><input v-model="sigName" placeholder="Your full legal name" /></label>
        <label class="fld"><span class="label">Place</span><input v-model="sigPlace" placeholder="City, State" /></label>
        <div class="row">
          <button class="primary" :disabled="!!eng.busy || !sigName.trim()" @click="approveSign">{{ eng.busy === 'client-approve' ? 'Signing…' : 'Sign & approve' }}</button>
          <button :disabled="!!eng.busy" @click="mode = 'idle'">Cancel</button>
        </div>
      </div>
      <div v-else class="stack" style="gap: 10px">
        <textarea v-model="changeComment" rows="3" placeholder="Describe the changes you'd like the provider to make…" />
        <div class="row">
          <button class="primary" :disabled="!!eng.busy || !changeComment.trim()" @click="sendChanges">{{ eng.busy === 'client-request-changes' ? 'Sending…' : 'Send request' }}</button>
          <button :disabled="!!eng.busy" @click="mode = 'idle'">Cancel</button>
        </div>
      </div>
    </div>
    <div class="card pad" v-else-if="hasTerms()"><p class="muted" style="margin: 0">{{ eng.clientMessage }}</p></div>
  </div>
</template>

<style scoped>
.danger { color: var(--risk); }
.danger:hover { background: var(--risk-weak); border-color: var(--risk); color: var(--risk); }
.danger-btn { background: var(--risk); border-color: var(--risk); color: #fff; }
.danger-btn:hover { background: #b03636; border-color: #b03636; }
.btn-file { display: inline-flex; align-items: center; cursor: pointer; white-space: nowrap; }
.prior { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 12px; }
.prior summary { cursor: pointer; font-size: 13px; color: var(--ink-soft); font-weight: 600; }
.prior .doc { opacity: 0.85; }
.off-pill { background: #eef0f2; color: var(--muted); padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.docs { display: grid; gap: 10px; }
.doc { display: flex; justify-content: space-between; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.dinfo { min-width: 0; }
.prog { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.bar { width: 130px; height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.fill.done { background: var(--ok); }
.okc { color: var(--ok); font-weight: 600; }
.btn-link { border: 1px solid var(--line-strong); background: var(--panel); padding: 8px 14px; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 500; color: var(--ink); text-decoration: none; }
.btn-link:hover { border-color: var(--muted); text-decoration: none; }
.req { background: var(--warn-weak); color: var(--warn); border-radius: 10px; padding: 12px 14px; font-style: italic; }
.response { border-left: 3px solid var(--accent); background: var(--accent-weak, #e3ecf9); }
.rhead { font-weight: 600; color: var(--accent-ink); margin-bottom: 8px; }
.rbody { margin: 0; font-size: 16px; line-height: 1.5; font-style: italic; }
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.opt { border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
.fld { display: flex; flex-direction: column; gap: 6px; }
.dtitle { color: var(--accent-ink); text-transform: uppercase; letter-spacing: 0.05em; font-size: 12px; margin-bottom: 12px; }
.pdf { background: #e6ebf3; border-radius: 10px; padding: 14px; max-height: 640px; overflow-y: auto; }
.page-wrap { position: relative; max-width: 620px; margin: 0 auto 14px; box-shadow: var(--shadow); background: #fff; border-radius: 3px; overflow: hidden; }
.page-wrap img { display: block; width: 100%; }
.pageno { position: absolute; top: 6px; right: 8px; font-size: 11px; color: var(--muted); background: rgba(255, 255, 255, 0.9); padding: 1px 7px; border-radius: 5px; }
.termgrp { margin-bottom: 8px; }
.tg { font-size: 12px; color: var(--accent-ink); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin: 14px 0 8px; }
.term { padding: 10px 0; border-bottom: 1px solid var(--line); }
.term:last-child { border-bottom: none; }
.fees { margin: 4px 0 0; padding-left: 18px; }
.fees .val { font-weight: 600; }
.tiers { margin: 2px 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
.cond { color: var(--warn); font-size: 12px; }
.cite { margin-top: 4px; }
.fleetset { display: flex; flex-direction: column; gap: 6px; width: 130px; }
.fleetset input { text-align: right; }
.estline { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); font-size: 14px; }
.finance { border-left: 3px solid var(--accent); }
.ack { display: flex; gap: 10px; align-items: flex-start; font-size: 14px; line-height: 1.5; cursor: pointer; }
.ack input { margin-top: 3px; flex-shrink: 0; }
@media (max-width: 720px) { .opts { grid-template-columns: 1fr; } }
</style>
