<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import StatusPill from '../components/StatusPill.vue'
import { api } from '../services/api'

const route = useRoute()
const eid = route.params.eid

const data = ref(null)
const err = ref('')
const busy = ref('')
const inviteEmail = ref('')
const inviteRole = ref('client')
const clientTerms = ref([])
const showChanges = ref(false)
const changeComment = ref('')

const submission = computed(() => data.value?.submission)
const documents = computed(() => data.value?.documents || [])
const status = computed(() => submission.value?.status)
const isProvider = computed(() => data.value?.your_role !== 'client')

async function load() {
  try {
    data.value = (await api.get(`/engagements/${eid}`)).data
    if (data.value.your_role === 'client') await loadClientTerms()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
}

function docFor(type) {
  const sub = submission.value
  const id = type === 'MSA' ? sub?.msa_document_id : sub?.mla_document_id
  if (id) {
    const linked = documents.value.find((d) => d.document_id === id)
    if (linked) return linked
  }
  return documents.value.find((d) => d.doc_type === type)
}

// Client sees a plain, read-only list of the APPROVED terms (the API filters to approved).
async function loadClientTerms() {
  const out = []
  for (const type of ['MSA', 'MLA']) {
    const d = docFor(type)
    if (!d) continue
    try {
      const r = await api.get(
        `/engagements/${eid}/documents/${d.document_id}/versions/${d.current_version}/fields`,
      )
      out.push({ doc_type: type, fields: r.data.fields })
    } catch {
      /* ignore per-doc failures */
    }
  }
  clientTerms.value = out
}

async function upload(type, event) {
  const file = event.target.files[0]
  if (!file) return
  busy.value = `upload-${type}`
  err.value = ''
  try {
    const { data: p } = await api.post(`/engagements/${eid}/documents:presign`, {
      doc_type: type,
      filename: file.name,
      submission_id: submission.value.submission_id,
    })
    await fetch(p.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/pdf' },
      body: file,
    })
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  } finally {
    busy.value = ''
  }
}

async function action(verb, body) {
  busy.value = verb
  err.value = ''
  try {
    await api.post(
      `/engagements/${eid}/submissions/${submission.value.submission_id}:${verb}`,
      body || {},
    )
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  } finally {
    busy.value = ''
  }
}

async function submitChanges() {
  await action('client-request-changes', { comment: changeComment.value })
  showChanges.value = false
  changeComment.value = ''
}

async function invite() {
  busy.value = 'invite'
  err.value = ''
  try {
    await api.post(`/engagements/${eid}/invitations`, { email: inviteEmail.value, role: inviteRole.value })
    inviteEmail.value = ''
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  } finally {
    busy.value = ''
  }
}

const canRunExtraction = computed(
  () => isProvider.value && status.value === 'DRAFT' && (docFor('MSA') || docFor('MLA')),
)
const canSubmitToClient = computed(() => isProvider.value && status.value === 'IN_UNDERWRITING')
const clientGate = computed(() => !isProvider.value && status.value === 'PENDING_CLIENT_APPROVAL')
const financeGate = computed(() => isProvider.value && status.value === 'PENDING_FINANCE_APPROVAL')
const canSetupBilling = computed(() => isProvider.value && status.value === 'FINANCE_APPROVED')
const reviewable = computed(() =>
  ['IN_UNDERWRITING', 'PENDING_CLIENT_APPROVAL', 'CLIENT_APPROVED', 'PENDING_FINANCE_APPROVAL',
   'FINANCE_APPROVED', 'ACTIVE'].includes(status.value),
)

const reviewDocs = computed(() => ['MSA', 'MLA'].map((t) => docFor(t)).filter(Boolean))
const totalTerms = computed(() => reviewDocs.value.reduce((n, d) => n + (d.review?.total || 0), 0))
const approvedTerms = computed(() => reviewDocs.value.reduce((n, d) => n + (d.review?.approved || 0), 0))
const allApproved = computed(() => totalTerms.value > 0 && approvedTerms.value === totalTerms.value)

const clientMessage = computed(() => {
  const s = status.value
  if (['CLIENT_APPROVED', 'PENDING_FINANCE_APPROVAL', 'FINANCE_APPROVED', 'BILLING_SETUP', 'ACTIVE'].includes(s))
    return 'You approved these terms — they are being finalized. Nothing more is needed from you.'
  if (['CHANGES_REQUESTED_CLIENT', 'REVALIDATING', 'VALIDATION_FAILED'].includes(s))
    return 'Your change request was sent. The provider is updating the agreement and will resubmit.'
  return 'Your billing terms are being prepared. They will appear here for your review shortly.'
})

const money = (n) =>
  n == null ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
const prettyService = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2')

function feeLine(fi) {
  const parts = []
  if (fi.amount != null) parts.push(money(fi.amount))
  if (fi.rate_pct != null) parts.push(`${fi.fee_type === 'cost_plus' ? 'cost + ' : ''}${fi.rate_pct}%`)
  if (fi.unit_basis) parts.push(fi.unit_basis.replace(/_/g, ' '))
  if (fi.minimum != null) parts.push(`min ${money(fi.minimum)}`)
  return parts.join(' · ')
}

onMounted(load)
</script>

<template>
  <div class="container stack" v-if="data">
    <div class="spread">
      <div>
        <router-link to="/" class="muted">← Engagements</router-link>
        <h1 style="margin-top: 4px">{{ data.engagement.name }}</h1>
        <div class="muted">{{ data.engagement.client_name }}</div>
      </div>
      <StatusPill v-if="status" :status="status" />
    </div>

    <p v-if="err" class="err">{{ err }}</p>

    <!-- ============ PROVIDER ============ -->
    <template v-if="isProvider">
      <div class="card sec">
        <h2>Agreements</h2>
        <div class="docs">
          <div v-for="type in ['MSA', 'MLA']" :key="type" class="doc">
            <div class="spread">
              <div class="dinfo">
                <h3>{{ type }}</h3>
                <div class="muted small">{{ docFor(type)?.filename || 'Not uploaded' }}</div>
                <div v-if="docFor(type)?.review?.total && reviewable" class="prog">
                  <div class="bar">
                    <div class="fill" :class="{ done: docFor(type).review.pct === 100 }" :style="{ width: docFor(type).review.pct + '%' }" />
                  </div>
                  <span class="small" :class="docFor(type).review.pct === 100 ? 'okc' : 'muted'">
                    {{ docFor(type).review.pct }}% reviewed ({{ docFor(type).review.approved }}/{{ docFor(type).review.total }})
                  </span>
                </div>
              </div>
              <div class="row">
                <router-link
                  v-if="docFor(type) && reviewable"
                  class="button-link"
                  :to="`/engagements/${eid}/documents/${docFor(type).document_id}/v/${docFor(type).current_version}/review`"
                >Review</router-link>
                <label v-if="status === 'DRAFT'" class="upload">
                  {{ docFor(type) ? 'Replace' : 'Upload' }}
                  <input type="file" accept="application/pdf" @change="upload(type, $event)" hidden />
                </label>
                <span v-if="busy === `upload-${type}`" class="muted small">uploading…</span>
              </div>
            </div>
          </div>
        </div>
        <button v-if="canRunExtraction" class="primary" :disabled="busy === 'submit-for-processing'" @click="action('submit-for-processing')">
          {{ busy === 'submit-for-processing' ? 'Starting…' : 'Run extraction' }}
        </button>
        <p v-if="status === 'EXTRACTING'" class="muted small">
          Extraction running — parsing pages and pulling billing terms with Claude. Refresh in a moment.
        </p>
      </div>

      <div class="card sec" v-if="canSubmitToClient || financeGate || canSetupBilling">
        <h2>Next step</h2>
        <div v-if="canSubmitToClient">
          <button class="primary" :disabled="busy || !allApproved" @click="action('submit-to-client')">
            {{ busy === 'submit-to-client' ? 'Submitting…' : 'Submit terms to client' }}
          </button>
          <p v-if="!allApproved" class="muted small" style="margin-top: 8px">
            Approve all {{ totalTerms }} terms first — {{ approvedTerms }}/{{ totalTerms }} approved.
            Open each agreement's <strong>Review</strong> and click “Approve all”.
          </p>
        </div>
        <div class="row" v-if="financeGate">
          <button class="primary" :disabled="busy" @click="action('finance-approve')">Approve (finance)</button>
          <button :disabled="busy" @click="action('finance-request-changes', { comment: prompt('What changes?') || '' })">Request changes</button>
        </div>
        <div class="row" v-if="canSetupBilling">
          <button class="primary" :disabled="busy" @click="action('setup-billing')">Set up billing</button>
        </div>
      </div>

      <div class="card sec">
        <h2>People</h2>
        <div class="members">
          <div v-for="m in data.members" :key="m.user_id" class="member">
            <span>{{ m.email }}</span><span class="pill role">{{ m.role }}</span>
          </div>
        </div>
        <div class="row" style="margin-top: 10px">
          <input v-model="inviteEmail" placeholder="Invite by email" />
          <select v-model="inviteRole" style="width: 140px">
            <option value="client">Client</option>
            <option value="provider">Provider</option>
          </select>
          <button :disabled="!inviteEmail || busy === 'invite'" @click="invite">
            {{ busy === 'invite' ? 'Inviting…' : 'Invite' }}
          </button>
        </div>
      </div>
    </template>

    <!-- ============ CLIENT ============ -->
    <template v-else>
      <div class="card sec">
        <h2>Billing terms for your review</h2>
        <p class="muted small" v-if="clientGate">
          These are the terms {{ data.engagement.name }} has proposed. Review them and either
          approve, or request changes with a note.
        </p>
        <template v-if="clientTerms.some((g) => g.fields.length)">
          <div v-for="grp in clientTerms" :key="grp.doc_type" class="termgrp">
            <h3 class="tg">{{ grp.doc_type === 'MSA' ? 'Fleet Management Services (MSA)' : 'Vehicle Lease (MLA)' }}</h3>
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
        <p v-else class="muted">{{ clientMessage }}</p>
      </div>

      <div class="card sec" v-if="clientGate">
        <h2>Your decision</h2>
        <div v-if="!showChanges" class="row">
          <button class="primary" :disabled="busy" @click="action('client-approve')">
            {{ busy === 'client-approve' ? 'Approving…' : 'Approve terms' }}
          </button>
          <button :disabled="busy" @click="showChanges = true">Request changes</button>
        </div>
        <div v-else class="stack">
          <textarea v-model="changeComment" rows="3" class="tarea"
            placeholder="Describe the changes you'd like the provider to make…" />
          <div class="row">
            <button class="primary" :disabled="busy || !changeComment.trim()" @click="submitChanges">
              {{ busy === 'client-request-changes' ? 'Sending…' : 'Send request' }}
            </button>
            <button :disabled="busy" @click="showChanges = false">Cancel</button>
          </div>
        </div>
      </div>
      <div class="card sec" v-else-if="clientTerms.some((g) => g.fields.length)">
        <p class="muted">{{ clientMessage }}</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sec { padding: 18px; }
.small { font-size: 12px; }
.err { color: var(--risk); }
.docs { display: grid; gap: 10px; margin-bottom: 14px; }
.doc { border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; }
.upload, .button-link {
  border: 1px solid var(--line); background: #fff; padding: 6px 12px; border-radius: 8px;
  cursor: pointer; font-size: 13px; color: var(--ink); text-decoration: none;
}
.upload:hover, .button-link:hover { border-color: var(--accent); }
.members { display: grid; gap: 6px; }
.member { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line); }
.pill.role { background: #eef0f2; color: var(--muted); text-transform: capitalize; }
.dinfo { min-width: 0; }
.prog { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.bar { width: 120px; height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; background: var(--accent); transition: width 0.3s; }
.fill.done { background: var(--ok); }
.okc { color: var(--ok); font-weight: 600; }
.termgrp { margin-top: 14px; }
.tg { font-size: 13px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid var(--line); padding-bottom: 6px; margin-bottom: 8px; }
.term { padding: 8px 0; border-bottom: 1px solid var(--line); }
.term:last-child { border-bottom: none; }
.fees { margin: 4px 0 0; padding-left: 18px; }
.fees .val { font-weight: 600; }
.tiers { margin: 2px 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
.cond { color: var(--warn); font-size: 12px; }
.cite { margin-top: 4px; }
.tarea { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font: inherit; resize: vertical; }
</style>
