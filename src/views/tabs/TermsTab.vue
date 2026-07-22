<script setup>
import { ref } from 'vue'
import { useRoute } from 'vue-router'

import { feeLine, money, prettyService, useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eid = route.params.eid
const eng = useEngagementStore()

const showChanges = ref(false)
const changeComment = ref('')

function onUpload(type, e) {
  const f = e.target.files[0]
  if (f) eng.upload(type, f)
}
async function sendChanges() {
  await eng.action('client-request-changes', { comment: changeComment.value })
  showChanges.value = false
  changeComment.value = ''
}
const hasTerms = () => eng.clientTerms.some((g) => g.fields.length)
</script>

<template>
  <!-- ============ PROVIDER ============ -->
  <div v-if="eng.isProvider" class="stack">
    <div class="card pad">
      <h2>Agreements</h2>
      <div class="docs">
        <div v-for="type in ['MSA', 'MLA']" :key="type" class="doc">
          <div class="dinfo">
            <div class="row" style="gap: 8px">
              <strong>{{ type }}</strong>
              <span class="muted small">{{ eng.docFor(type)?.filename || 'Not uploaded' }}</span>
            </div>
            <div v-if="eng.docFor(type)?.review?.total && eng.reviewable" class="prog">
              <div class="bar">
                <div class="fill" :class="{ done: eng.docFor(type).review.pct === 100 }" :style="{ width: eng.docFor(type).review.pct + '%' }" />
              </div>
              <span class="small" :class="eng.docFor(type).review.pct === 100 ? 'okc' : 'muted'">
                {{ eng.docFor(type).review.pct }}% reviewed ({{ eng.docFor(type).review.approved }}/{{ eng.docFor(type).review.total }})
              </span>
            </div>
          </div>
          <div class="row">
            <router-link
              v-if="eng.docFor(type) && eng.reviewable"
              class="btn-link"
              :to="`/engagements/${eid}/documents/${eng.docFor(type).document_id}/v/${eng.docFor(type).current_version}/review`"
            >Review</router-link>
            <label v-if="eng.status === 'DRAFT'" class="btn-link">
              {{ eng.docFor(type) ? 'Replace' : 'Upload' }}
              <input type="file" accept="application/pdf" hidden @change="onUpload(type, $event)" />
            </label>
            <span v-if="eng.busy === `upload-${type}`" class="muted small">uploading…</span>
          </div>
        </div>
      </div>
      <button v-if="eng.status === 'DRAFT' && (eng.docFor('MSA') || eng.docFor('MLA'))"
        class="primary" style="margin-top: 14px" :disabled="!!eng.busy" @click="eng.action('submit-for-processing')">
        {{ eng.busy === 'submit-for-processing' ? 'Starting…' : 'Run extraction' }}
      </button>
      <p v-if="eng.status === 'EXTRACTING'" class="muted small" style="margin-top: 10px">
        Extraction running — parsing pages and pulling billing terms with Claude. Refresh in a moment.
      </p>
    </div>

    <div class="card pad" v-if="['IN_UNDERWRITING', 'PENDING_FINANCE_APPROVAL', 'FINANCE_APPROVED'].includes(eng.status)">
      <h2>Next step</h2>
      <div v-if="eng.status === 'IN_UNDERWRITING'">
        <button class="primary" :disabled="!!eng.busy || !eng.allApproved" @click="eng.action('submit-to-client')">
          {{ eng.busy === 'submit-to-client' ? 'Submitting…' : 'Submit terms to client' }}
        </button>
        <p v-if="!eng.allApproved" class="muted small" style="margin-top: 8px">
          Approve all {{ eng.totalTerms }} terms first — {{ eng.approvedTerms }}/{{ eng.totalTerms }} approved.
          Open each agreement's <strong>Review</strong> and click “Approve all”.
        </p>
      </div>
      <div class="row" v-else-if="eng.status === 'PENDING_FINANCE_APPROVAL'">
        <button class="primary" :disabled="!!eng.busy" @click="eng.action('finance-approve')">Approve (finance)</button>
        <button :disabled="!!eng.busy" @click="eng.action('finance-request-changes', { comment: prompt('What changes?') || '' })">Request changes</button>
      </div>
      <button v-else-if="eng.status === 'FINANCE_APPROVED'" class="primary" :disabled="!!eng.busy" @click="eng.action('setup-billing')">
        {{ eng.busy === 'setup-billing' ? 'Generating…' : 'Set up billing' }}
      </button>
    </div>
  </div>

  <!-- ============ CLIENT ============ -->
  <div v-else class="stack">
    <div class="card pad">
      <h2>Billing terms for your review</h2>
      <p class="muted small" v-if="eng.status === 'PENDING_CLIENT_APPROVAL'">
        These are the terms your provider has proposed. Review them below — you can open the source
        contract for any agreement — then approve or request changes.
      </p>
      <template v-if="hasTerms()">
        <div v-for="grp in eng.clientTerms" :key="grp.doc_type" class="termgrp">
          <div class="spread tg">
            <span>{{ grp.doc_type === 'MSA' ? 'Fleet Management Services (MSA)' : 'Vehicle Lease (MLA)' }}</span>
            <router-link class="src" :to="`/engagements/${eid}/documents/${grp.document_id}/v/${grp.version}/source`">View source ↗</router-link>
          </div>
          <div v-for="f in grp.fields" :key="f.field_id" class="term">
            <strong>{{ prettyService(f.service) }}</strong>
            <ul class="fees">
              <li v-for="(fi, i) in f.fee_items" :key="i">
                <span v-if="feeLine(fi)" class="val">{{ feeLine(fi) }}</span>
                <span v-if="fi.description" class="muted"> {{ feeLine(fi) ? '— ' : '' }}{{ fi.description }}</span>
                <ul v-if="fi.tier_bands?.length" class="tiers">
                  <li v-for="(t, j) in fi.tier_bands" :key="j">units {{ t.min_units }}–{{ t.max_units ?? '∞' }}: {{ money(t.amount) }}</li>
                </ul>
                <div v-for="(c, k) in fi.conditions || []" :key="k" class="cond">⚑ {{ c.description }}</div>
              </li>
            </ul>
            <div v-if="f.citations?.length" class="cite muted small">
              📄 p{{ f.citations[0].page }}<span v-if="f.citations[0].section_label"> · {{ f.citations[0].section_label }}</span>
            </div>
          </div>
        </div>
      </template>
      <p v-else class="muted">{{ eng.clientMessage }}</p>
    </div>

    <div class="card pad" v-if="eng.status === 'PENDING_CLIENT_APPROVAL'">
      <h2>Your decision</h2>
      <div v-if="!showChanges" class="row">
        <button class="primary" :disabled="!!eng.busy" @click="eng.action('client-approve')">
          {{ eng.busy === 'client-approve' ? 'Approving…' : 'Approve terms' }}
        </button>
        <button :disabled="!!eng.busy" @click="showChanges = true">Request changes</button>
      </div>
      <div v-else class="stack" style="gap: 10px">
        <textarea v-model="changeComment" rows="3" placeholder="Describe the changes you'd like the provider to make…" />
        <div class="row">
          <button class="primary" :disabled="!!eng.busy || !changeComment.trim()" @click="sendChanges">
            {{ eng.busy === 'client-request-changes' ? 'Sending…' : 'Send request' }}
          </button>
          <button :disabled="!!eng.busy" @click="showChanges = false">Cancel</button>
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
.termgrp { margin-top: 16px; }
.tg { font-size: 12px; color: var(--accent-ink); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; border-bottom: 1px solid var(--line); padding-bottom: 8px; margin-bottom: 8px; }
.src { font-size: 12px; text-transform: none; letter-spacing: 0; }
.term { padding: 10px 0; border-bottom: 1px solid var(--line); }
.term:last-child { border-bottom: none; }
.fees { margin: 4px 0 0; padding-left: 18px; }
.fees .val { font-weight: 600; }
.tiers { margin: 2px 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
.cond { color: var(--warn); font-size: 12px; }
.cite { margin-top: 4px; }
</style>
