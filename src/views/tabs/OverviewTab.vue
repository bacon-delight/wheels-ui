<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import JourneyStepper from '../../components/JourneyStepper.vue'
import { api } from '../../services/api'
import { useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eng = useEngagementStore()
const events = ref([])

// Activity lives here rather than in its own tab: the journey and what happened on it are the
// same question, and splitting them meant two clicks to answer it.
const ACTION_LABEL = {
  submit_for_processing: 'Submitted for extraction',
  pipeline_done: 'Extraction complete',
  submit_to_client: 'Submitted to customer',
  client_approve: 'Customer approved terms',
  client_request_changes: 'Customer requested changes',
  reupload: 'Document re-uploaded',
  sanity_pass: 'Sanity checks passed',
  sanity_fail: 'Sanity checks failed',
  capture_fields: 'Terms captured',
  resubmit_to_client: 'Terms resubmitted to the customer',
  billing_ready: 'Billing generated',
  approve_billing: 'Billing audit approved',
  audit_request_changes: 'Billing audit requested changes',
  reopen: 'Sent back for changes',
  field_approved: 'Term approved',
  field_corrected: 'Term corrected',
  user_invited: 'User invited',
  user_added: 'User given access',
  engagement_created: 'Engagement created',
  amendment_opened: 'Amendment opened',
  amendment_discarded: 'Amendment discarded',
  document_removed: 'Agreement removed',
  engagement_scope_changed: 'Scope changed',
  vehicle_assigned: 'Vehicles assigned',
  vehicle_released: 'Vehicle released',
}
const actionLabel = (a) => ACTION_LABEL[a] || a

// "Approve all" writes one row per term, so a single click filled the feed with a dozen
// identical lines. Consecutive rows of the same action by the same person collapse into one.
const PLURAL = {
  field_approved: (n) => `${n} terms approved`,
  field_corrected: (n) => `${n} terms corrected`,
  vehicle_assigned: (n) => `${n} vehicle assignments`,
}
const grouped = computed(() => {
  const out = []
  for (const e of events.value) {
    const last = out[out.length - 1]
    const sameRun =
      last && last.action === e.action && last.actor === (e.actor_name || e.actor_role) &&
      !e.comment && !last.comment && PLURAL[e.action]
    if (sameRun) {
      last.count += 1
      last.ts = e.ts // keep the earliest time of the run, since events arrive newest first
    } else {
      out.push({ ...e, actor: e.actor_name || e.actor_role, count: 1, key: e.event_id })
    }
  }
  return out
})
const groupLabel = (g) =>
  g.count > 1 && PLURAL[g.action] ? PLURAL[g.action](g.count) : actionLabel(g.action)
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

onMounted(async () => {
  try {
    events.value = (await api.get(`/engagements/${route.params.eid}/audit`)).data.events
  } catch {
    /* activity is supplementary; the rest of the page still renders */
  }
})

const LABELS = {
  DRAFT: 'Draft', EXTRACTING: 'Extracting terms', IN_UNDERWRITING: 'In underwriting review',
  PENDING_CLIENT_APPROVAL: 'Awaiting customer approval', CHANGES_REQUESTED_CLIENT: 'Customer requested changes',
  REVALIDATING: 'Re-validating', VALIDATION_FAILED: 'Validation failed', CLIENT_APPROVED: 'Customer approved',
  BILLING_SETUP: 'Setting up billing', PENDING_BILLING_AUDIT: 'Awaiting billing audit',
  CHANGES_REQUESTED_AUDIT: 'Billing audit requested changes', ACTIVE: 'Active',
}
// What a customer is told the engagement is doing. The internal stages are one thing to
// them — Wheels is working on it — and naming underwriting or the billing audit invites
// questions about a process they are not part of.
const CUSTOMER_LABELS = {
  DRAFT: 'Being prepared', EXTRACTING: 'Being prepared', REVALIDATING: 'Being prepared',
  IN_UNDERWRITING: 'Being prepared', VALIDATION_FAILED: 'Being prepared',
  PENDING_CLIENT_APPROVAL: 'Ready for your review',
  CHANGES_REQUESTED_CLIENT: 'Your changes are being made',
  CLIENT_APPROVED: 'Being finalised', BILLING_SETUP: 'Being finalised',
  PENDING_BILLING_AUDIT: 'Being finalised', CHANGES_REQUESTED_AUDIT: 'Being finalised',
  ACTIVE: 'Active',
}
const cycleStatus = computed(() =>
  eng.isProvider
    ? LABELS[eng.status] || eng.status
    : CUSTOMER_LABELS[eng.status] || 'Being prepared',
)
// While an amendment is under review the engagement itself is still live and billing, so the
// headline says Active and the amendment's own progress is the note beneath it. Reading
// "In underwriting review" over a signed, billing engagement would say the deal had come
// undone.
const statusLabel = computed(() => (eng.liveDuringAmendment ? 'Active' : cycleStatus.value))
const statusNote = computed(() =>
  eng.liveDuringAmendment ? `${eng.cycleLabel} · ${cycleStatus.value.toLowerCase()}` : null,
)

// A master agreement runs a fixed term; surface how much of it is left, and whether it renews.
const expiry = computed(() => {
  const end = eng.data?.engagement?.contract_end
  if (!end) return null
  const days = Math.round((new Date(end) - new Date()) / 86400000)
  const auto = eng.data?.engagement?.auto_renew
  const label =
    days < 0
      ? `lapsed ${Math.abs(days)} days ago`
      : `${days} days left${auto ? ' · auto-renews' : ''}`
  return { days, label }
})
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

const TERMS_TAB = { name: 'eng-terms' }
const nextHint = computed(() => {
  const s = eng.status
  const terms = (text) => ({ text, to: TERMS_TAB, cta: 'Go to Terms →' })
  if (eng.isProvider) {
    if (s === 'DRAFT') {
      // Which agreements apply comes from the engagement's scope, not a fixed pair.
      const missing = eng.missingDocTypes
      return terms(
        missing.length
          ? `Upload the ${missing.join(' and ')} and run extraction.`
          : 'Run extraction on the uploaded agreements.',
      )
    }
    if (s === 'IN_UNDERWRITING')
      return terms('Review and approve the extracted terms, then submit to the customer.')
    if (s === 'PENDING_CLIENT_APPROVAL')
      return terms('Waiting on the customer to sign the terms.')
    if (s === 'CHANGES_REQUESTED_CLIENT')
      return terms('The customer asked for changes. Re-upload the agreement or respond.')
    if (s === 'BILLING_SETUP')
      return terms('The customer has signed. Billing is being generated from the terms.')
    if (s === 'PENDING_BILLING_AUDIT')
      return {
        text: 'Check what makes up an invoice against the contract, then approve it to go live.',
        to: { name: 'billing-audit' },
        cta: 'Open the billing audit →',
      }
    if (s === 'CHANGES_REQUESTED_AUDIT')
      return terms('The billing audit sent this back. Correct the terms behind the charges.')
    return null
  }
  if (s === 'PENDING_CLIENT_APPROVAL')
    return terms('Review the proposed terms and sign, or request changes.')
  return null
})
</script>

<template>
  <div class="stack">
    <!-- Response to the customer's change request -->
    <div v-if="!eng.isProvider && eng.status === 'PENDING_CLIENT_APPROVAL' && eng.submission?.latest_comment" class="card pad response">
      <div class="rhead">💬 Response from {{ eng.submission?.latest_comment_by || 'your provider' }}</div>
      <p class="rbody">“{{ eng.submission.latest_comment }}”</p>
      <router-link :to="{ name: 'eng-terms', params: { eid: route.params.eid } }" class="golink" style="color: var(--accent-ink)">Review the updated terms →</router-link>
    </div>

    <div class="card pad">
      <div class="spread" style="margin-bottom: 18px">
        <h2 style="margin: 0">{{ eng.isAmendment ? eng.cycleLabel : 'Journey' }}</h2>
        <span class="muted small">{{ cycleStatus }}</span>
      </div>
      <p v-if="eng.liveDuringAmendment" class="muted small" style="margin: -8px 0 16px">
        The engagement is live and billing on the agreed terms. This is the amendment's progress.
      </p>
      <JourneyStepper :stage="eng.stage" :status="eng.status" :for-customer="!eng.isProvider" />
    </div>

    <div class="tiles">
      <div class="stattile">
        <div class="label">Status</div>
        <div class="val">
          {{ statusLabel }}
          <span v-if="statusNote" class="muted" style="font-weight: 400; font-size: 13px">{{ statusNote }}</span>
        </div>
      </div>
      <!-- No Customer tile: the engagement header already names the customer and links to
           them, and a tile repeating it costs a slot that carries something new. -->
      <div class="stattile">
        <div class="label">Vehicles</div>
        <div class="val">
          <router-link :to="{ name: 'eng-vehicles', params: { eid: route.params.eid } }">
            {{ eng.data.engagement.fleet_size }}
          </router-link>
          <span class="muted" style="font-weight: 400; font-size: 13px">billed</span>
        </div>
      </div>
      <div class="stattile" :class="{ warn: expiry && expiry.days <= 90 }">
        <div class="label">Contract expiry</div>
        <div class="val">
          <template v-if="expiry">
            {{ fmt(eng.data.engagement.contract_end) }}
            <span class="muted" style="font-weight: 400; font-size: 13px">{{ expiry.label }}</span>
          </template>
          <span v-else class="muted" style="font-size: 15px">Not recorded</span>
        </div>
      </div>
      <div v-if="eng.coverage && eng.coverage.total" class="stattile">
        <div class="label">Services</div>
        <div class="val">
          <router-link :to="{ name: 'eng-services', params: { eid: route.params.eid } }">
            {{ eng.coverage.availed }}<span class="muted" style="font-weight: 400">/{{ eng.coverage.total }}</span>
          </router-link>
          <span class="muted" style="font-weight: 400; font-size: 13px">&nbsp;availed</span>
        </div>
      </div>
      <div class="stattile"><div class="label">Created</div><div class="val">{{ fmt(eng.data.engagement.created_at) }}</div></div>
      <!-- Analyst approval progress is internal: the customer has not been shown these terms
           yet, and a count of what Wheels has signed off means nothing to them. -->
      <div v-if="eng.isProvider" class="stattile">
        <div class="label">Terms approved</div>
        <div class="val">{{ eng.approvedTerms }}<span class="muted" style="font-weight: 400">/{{ eng.totalTerms }}</span></div>
      </div>
    </div>

    <div v-if="nextHint" class="card pad next">
      <div class="label" style="color: var(--accent-ink)">Next step</div>
      <p style="margin: 6px 0 12px">{{ nextHint.text }}</p>
      <router-link :to="{ ...nextHint.to, params: { eid: route.params.eid } }" class="golink">{{ nextHint.cta }}</router-link>
    </div>

    <div class="card pad">
      <h2>Activity</h2>
      <div v-if="grouped.length" class="timeline">
        <div v-for="g in grouped" :key="g.key" class="ev">
          <div class="dot" />
          <div class="ebody">
            <div class="etop">
              <strong>{{ groupLabel(g) }}</strong>
              <span class="muted small">{{ when(g.ts) }}</span>
            </div>
            <div class="muted small">
              by {{ g.actor }}<span v-if="g.comment"> — “{{ g.comment }}”</span>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="muted">No activity yet.</p>
    </div>
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.stattile.warn { border-left: 3px solid var(--warn); }
.next { border-left: 3px solid var(--accent); }
.response { border-left: 3px solid var(--accent); background: var(--accent-weak, #e3ecf9); }
.rhead { font-weight: 600; color: var(--accent-ink); margin-bottom: 8px; }
.rbody { margin: 0 0 12px; font-size: 16px; line-height: 1.5; font-style: italic; }
.golink { font-weight: 600; }
.timeline { display: flex; flex-direction: column; }
.ev { display: flex; gap: 12px; padding-bottom: 16px; position: relative; }
.ev:not(:last-child)::before { content: ''; position: absolute; left: 4px; top: 12px; bottom: 0; width: 2px; background: var(--line); }
.dot { width: 10px; height: 10px; border-radius: 999px; background: var(--accent); margin-top: 4px; flex-shrink: 0; z-index: 1; }
.etop { display: flex; justify-content: space-between; gap: 10px; }
.ebody { flex: 1; min-width: 0; }
@media (max-width: 720px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
</style>
