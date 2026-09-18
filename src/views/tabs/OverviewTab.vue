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
  submit_to_client: 'Submitted to client',
  client_approve: 'Client approved terms',
  client_request_changes: 'Client requested changes',
  reupload: 'Document re-uploaded',
  sanity_pass: 'Sanity checks passed',
  sanity_fail: 'Sanity checks failed',
  capture_fields: 'Terms captured',
  finance_approve: 'Finance approved',
  finance_request_changes: 'Finance requested changes',
  setup_billing: 'Billing setup started',
  billing_done: 'Billing configured',
  field_approved: 'Term approved',
  field_corrected: 'Term corrected',
  user_invited: 'User invited',
  engagement_created: 'Engagement created',
  engagement_scope_changed: 'Scope changed',
  vehicle_assigned: 'Vehicles assigned',
  vehicle_released: 'Vehicle released',
}
const actionLabel = (a) => ACTION_LABEL[a] || a
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
  PENDING_CLIENT_APPROVAL: 'Awaiting client approval', CHANGES_REQUESTED_CLIENT: 'Client requested changes',
  REVALIDATING: 'Re-validating', VALIDATION_FAILED: 'Validation failed', CLIENT_APPROVED: 'Client approved',
  PENDING_FINANCE_APPROVAL: 'Awaiting finance', CHANGES_REQUESTED_FINANCE: 'Finance requested changes',
  FINANCE_APPROVED: 'Finance approved', BILLING_SETUP: 'Setting up billing', ACTIVE: 'Active',
}
const statusLabel = computed(() => LABELS[eng.status] || eng.status)
const fmt = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

const nextHint = computed(() => {
  const s = eng.status
  if (eng.isProvider) {
    if (s === 'DRAFT') {
      // Which agreements apply comes from the engagement's scope, not a fixed pair.
      const missing = eng.missingDocTypes
      if (missing.length) return `Upload the ${missing.join(' and ')} and run extraction.`
      return 'Run extraction on the uploaded agreements.'
    }
    if (s === 'IN_UNDERWRITING') return 'Review and approve the extracted terms, then submit to the client.'
    if (s === 'PENDING_FINANCE_APPROVAL') return 'Validate the client-approved terms as finance.'
    if (s === 'FINANCE_APPROVED') return 'Generate the billing configuration.'
    if (s === 'PENDING_CLIENT_APPROVAL') return 'Waiting on the client to approve the terms.'
    return null
  }
  if (s === 'PENDING_CLIENT_APPROVAL') return 'Review the proposed terms and approve, or request changes.'
  return null
})
</script>

<template>
  <div class="stack">
    <!-- Provider's response to the client's change request -->
    <div v-if="!eng.isProvider && eng.status === 'PENDING_CLIENT_APPROVAL' && eng.submission?.latest_comment" class="card pad response">
      <div class="rhead">💬 Response from {{ eng.submission?.latest_comment_by || 'your provider' }}</div>
      <p class="rbody">“{{ eng.submission.latest_comment }}”</p>
      <router-link :to="{ name: 'eng-terms', params: { eid: route.params.eid } }" class="golink" style="color: var(--accent-ink)">Review the updated terms →</router-link>
    </div>

    <div class="card pad">
      <div class="spread" style="margin-bottom: 18px">
        <h2 style="margin: 0">Journey</h2>
        <span class="muted small">{{ statusLabel }}</span>
      </div>
      <JourneyStepper :status="eng.status" />
    </div>

    <div class="tiles">
      <div class="stattile"><div class="label">Status</div><div class="val">{{ statusLabel }}</div></div>
      <div class="stattile">
        <div class="label">Customer</div>
        <div class="val">
          <router-link v-if="eng.customer" :to="`/customers/${eng.customer.customer_id}`">{{ eng.data.engagement.client_name }}</router-link>
          <span v-else>{{ eng.data.engagement.client_name }}</span>
        </div>
      </div>
      <div class="stattile">
        <div class="label">Vehicles</div>
        <div class="val">
          {{ eng.data.engagement.fleet_size }}
          <span class="muted" style="font-weight: 400; font-size: 13px">{{ eng.fleetSizeSource === 'override' ? 'set manually' : `${eng.assignedVehicleCount} assigned` }}</span>
        </div>
      </div>
      <div class="stattile"><div class="label">Created</div><div class="val">{{ fmt(eng.data.engagement.created_at) }}</div></div>
      <div class="stattile">
        <div class="label">Terms approved</div>
        <div class="val">{{ eng.approvedTerms }}<span class="muted" style="font-weight: 400">/{{ eng.totalTerms }}</span></div>
      </div>
    </div>

    <div v-if="nextHint" class="card pad next">
      <div class="label" style="color: var(--accent-ink)">Next step</div>
      <p style="margin: 6px 0 12px">{{ nextHint }}</p>
      <router-link :to="{ name: 'eng-terms', params: { eid: route.params.eid } }" class="golink">Go to Terms →</router-link>
    </div>

    <div class="card pad">
      <h2>Activity</h2>
      <div v-if="events.length" class="timeline">
        <div v-for="e in events" :key="e.event_id" class="ev">
          <div class="dot" />
          <div class="ebody">
            <div class="etop">
              <strong>{{ actionLabel(e.action) }}</strong>
              <span class="muted small">{{ when(e.ts) }}</span>
            </div>
            <div class="muted small">
              by {{ e.actor_name || e.actor_role }}<span v-if="e.comment"> — “{{ e.comment }}”</span>
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
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
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
