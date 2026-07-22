<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../../services/api'
import { feeLine, money, prettyService, useEngagementStore } from '../../stores/engagement'

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

function onUpload(type, e) {
  const f = e.target.files[0]
  if (f) eng.upload(type, f)
}
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
      <h2>Agreements</h2>
      <div class="docs">
        <div v-for="type in ['MSA', 'MLA']" :key="type" class="doc">
          <div class="dinfo">
            <div class="row" style="gap: 8px"><strong>{{ type }}</strong><span class="muted small">{{ eng.docFor(type)?.filename || 'Not uploaded' }}</span></div>
            <div v-if="eng.docFor(type)?.review?.total && eng.reviewable" class="prog">
              <div class="bar"><div class="fill" :class="{ done: eng.docFor(type).review.pct === 100 }" :style="{ width: eng.docFor(type).review.pct + '%' }" /></div>
              <span class="small" :class="eng.docFor(type).review.pct === 100 ? 'okc' : 'muted'">{{ eng.docFor(type).review.pct }}% reviewed ({{ eng.docFor(type).review.approved }}/{{ eng.docFor(type).review.total }})</span>
            </div>
          </div>
          <div class="row">
            <router-link v-if="eng.docFor(type) && eng.reviewable" class="btn-link" :to="`/engagements/${eid}/documents/${eng.docFor(type).document_id}/v/${eng.docFor(type).current_version}/review`">Review</router-link>
            <label v-if="eng.status === 'DRAFT'" class="btn-link">{{ eng.docFor(type) ? 'Replace' : 'Upload' }}<input type="file" accept="application/pdf" hidden @change="onUpload(type, $event)" /></label>
            <span v-if="eng.busy === `upload-${type}`" class="muted small">uploading…</span>
          </div>
        </div>
      </div>
      <button v-if="eng.status === 'DRAFT' && (eng.docFor('MSA') || eng.docFor('MLA'))" class="primary" style="margin-top: 14px" :disabled="!!eng.busy" @click="eng.action('submit-for-processing')">
        {{ eng.busy === 'submit-for-processing' ? 'Starting…' : 'Run extraction' }}
      </button>
      <p v-if="eng.status === 'EXTRACTING' || eng.status === 'REVALIDATING'" class="muted small" style="margin-top: 10px">Processing — parsing pages and pulling billing terms with Claude. Refresh in a moment.</p>
    </div>

    <!-- Standard next-step -->
    <div class="card pad" v-if="['IN_UNDERWRITING', 'PENDING_FINANCE_APPROVAL', 'FINANCE_APPROVED'].includes(eng.status)">
      <h2>Next step</h2>
      <div v-if="eng.status === 'IN_UNDERWRITING'">
        <button class="primary" :disabled="!!eng.busy || !eng.allApproved" @click="eng.action('submit-to-client')">{{ eng.busy === 'submit-to-client' ? 'Submitting…' : 'Submit terms to client' }}</button>
        <p v-if="!eng.allApproved" class="muted small" style="margin-top: 8px">Approve all {{ eng.totalTerms }} terms first — {{ eng.approvedTerms }}/{{ eng.totalTerms }} approved. Open each agreement's <strong>Review</strong> and click “Approve all”.</p>
      </div>
      <div class="row" v-else-if="eng.status === 'PENDING_FINANCE_APPROVAL'">
        <button class="primary" :disabled="!!eng.busy" @click="eng.action('finance-approve')">Approve (finance)</button>
        <button :disabled="!!eng.busy" @click="eng.action('finance-request-changes', { comment: prompt('What changes?') || '' })">Request changes</button>
      </div>
      <button v-else-if="eng.status === 'FINANCE_APPROVED'" class="primary" :disabled="!!eng.busy" @click="eng.action('setup-billing')">{{ eng.busy === 'setup-billing' ? 'Generating…' : 'Set up billing' }}</button>
    </div>

    <!-- Client requested changes -->
    <div class="card pad" v-if="eng.status === 'CHANGES_REQUESTED_CLIENT'">
      <h2>Client requested changes</h2>
      <p class="req">“{{ eng.submission?.latest_comment || 'The client asked for changes.' }}”</p>
      <div class="opts">
        <div class="opt">
          <strong>Re-upload the updated agreement</strong>
          <p class="muted small">Upload a revised document, add a note for the client, then re-validate.</p>
          <div class="row">
            <label class="btn-link">Upload MSA<input type="file" accept="application/pdf" hidden @change="onUpload('MSA', $event)" /></label>
            <label class="btn-link">Upload MLA<input type="file" accept="application/pdf" hidden @change="onUpload('MLA', $event)" /></label>
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

    <template v-if="!hasTerms()">
      <div class="card pad"><p class="muted" style="margin: 0">{{ eng.clientMessage }}</p></div>
    </template>

    <!-- Documents (PDF) view -->
    <template v-else-if="view === 'documents'">
      <div v-for="g in eng.clientTerms" :key="g.document_id" class="card pad">
        <h3 class="dtitle">{{ g.doc_type === 'MSA' ? 'Fleet Management Services (MSA)' : 'Vehicle Lease (MLA)' }}</h3>
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
          <div class="tg">{{ grp.doc_type === 'MSA' ? 'Fleet Management Services (MSA)' : 'Vehicle Lease (MLA)' }}</div>
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
.opts { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.opt { border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
.fld { display: flex; flex-direction: column; gap: 6px; }
.dtitle { color: var(--accent-ink); text-transform: uppercase; letter-spacing: 0.05em; font-size: 12px; margin-bottom: 12px; }
.pdf { background: #eceae4; border-radius: 10px; padding: 14px; max-height: 640px; overflow-y: auto; }
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
@media (max-width: 720px) { .opts { grid-template-columns: 1fr; } }
</style>
