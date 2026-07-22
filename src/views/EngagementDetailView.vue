<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import StatusPill from '../components/StatusPill.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const auth = useAuthStore()
const eid = route.params.eid

const data = ref(null)
const err = ref('')
const busy = ref('')
const inviteEmail = ref('')
const inviteRole = ref('client')

const submission = computed(() => data.value?.submission)
const documents = computed(() => data.value?.documents || [])
const status = computed(() => submission.value?.status)
const isProvider = computed(() => data.value?.your_role !== 'client')

async function load() {
  try {
    data.value = (await api.get(`/engagements/${eid}`)).data
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
}

function docFor(type) {
  // Prefer the document actually linked to the submission slot (a failed first upload can
  // leave an orphan of the same type; the slot always points at the current one).
  const sub = submission.value
  const id = type === 'MSA' ? sub?.msa_document_id : sub?.mla_document_id
  if (id) {
    const linked = documents.value.find((d) => d.document_id === id)
    if (linked) return linked
  }
  return documents.value.find((d) => d.doc_type === type)
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
  }
  busy.value = ''
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
  }
  busy.value = ''
}

async function invite() {
  busy.value = 'invite'
  err.value = ''
  try {
    await api.post(`/engagements/${eid}/invitations`, {
      email: inviteEmail.value,
      role: inviteRole.value,
    })
    inviteEmail.value = ''
    await load()
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

// Which lifecycle buttons to show, given status + role.
const canRunExtraction = computed(
  () => isProvider.value && status.value === 'DRAFT' && (docFor('MSA') || docFor('MLA')),
)
const canSubmitToClient = computed(
  () => isProvider.value && status.value === 'IN_UNDERWRITING',
)
const clientGate = computed(
  () => !isProvider.value && status.value === 'PENDING_CLIENT_APPROVAL',
)
const financeGate = computed(
  () => isProvider.value && status.value === 'PENDING_FINANCE_APPROVAL',
)
const canSetupBilling = computed(
  () => isProvider.value && status.value === 'FINANCE_APPROVED',
)
const reviewable = computed(() =>
  ['IN_UNDERWRITING', 'PENDING_CLIENT_APPROVAL', 'CLIENT_APPROVED', 'PENDING_FINANCE_APPROVAL',
   'FINANCE_APPROVED', 'ACTIVE'].includes(status.value),
)

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

    <!-- Documents -->
    <div class="card sec">
      <h2>Agreements</h2>
      <div class="docs">
        <div v-for="type in ['MSA', 'MLA']" :key="type" class="doc">
          <div class="spread">
            <div>
              <h3>{{ type }}</h3>
              <div class="muted small">{{ docFor(type)?.filename || 'Not uploaded' }}</div>
            </div>
            <div class="row">
              <router-link
                v-if="docFor(type) && reviewable"
                class="button-link"
                :to="`/engagements/${eid}/documents/${docFor(type).document_id}/v/${docFor(type).current_version}/review`"
              >Review</router-link>
              <label v-if="isProvider && status === 'DRAFT'" class="upload">
                {{ docFor(type) ? 'Replace' : 'Upload' }}
                <input type="file" accept="application/pdf" @change="upload(type, $event)" hidden />
              </label>
              <span v-if="busy === `upload-${type}`" class="muted small">uploading…</span>
            </div>
          </div>
        </div>
      </div>
      <button
        v-if="canRunExtraction"
        class="primary"
        :disabled="busy === 'submit-for-processing'"
        @click="action('submit-for-processing')"
      >
        {{ busy === 'submit-for-processing' ? 'Starting…' : 'Run extraction' }}
      </button>
      <p v-if="status === 'EXTRACTING'" class="muted small">
        Extraction running — parsing pages and pulling billing terms with Claude. Refresh in a moment.
      </p>
    </div>

    <!-- Lifecycle actions -->
    <div class="card sec" v-if="canSubmitToClient || clientGate || financeGate || canSetupBilling">
      <h2>Next step</h2>
      <div class="row" v-if="canSubmitToClient">
        <button class="primary" :disabled="busy" @click="action('submit-to-client')">
          Submit terms to client
        </button>
      </div>
      <div class="row" v-if="clientGate">
        <button class="primary" :disabled="busy" @click="action('client-approve')">Approve terms</button>
        <button :disabled="busy" @click="action('client-request-changes', { comment: prompt('What changes?') || '' })">
          Request changes
        </button>
      </div>
      <div class="row" v-if="financeGate">
        <button class="primary" :disabled="busy" @click="action('finance-approve')">Approve (finance)</button>
        <button :disabled="busy" @click="action('finance-request-changes', { comment: prompt('What changes?') || '' })">
          Request changes
        </button>
      </div>
      <div class="row" v-if="canSetupBilling">
        <button class="primary" :disabled="busy" @click="action('setup-billing')">
          Set up billing
        </button>
      </div>
    </div>

    <!-- People -->
    <div class="card sec" v-if="isProvider">
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
</style>
