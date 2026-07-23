<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import JourneyStepper from '../../components/JourneyStepper.vue'
import { useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eng = useEngagementStore()

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
    if (s === 'DRAFT') return 'Upload both agreements and run extraction.'
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
      <div class="stattile"><div class="label">Client</div><div class="val">{{ eng.data.engagement.client_name }}</div></div>
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
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.next { border-left: 3px solid var(--accent); }
.response { border-left: 3px solid var(--accent); background: var(--accent-weak, #eef0ff); }
.rhead { font-weight: 600; color: var(--accent-ink); margin-bottom: 8px; }
.rbody { margin: 0 0 12px; font-size: 16px; line-height: 1.5; font-style: italic; }
.golink { font-weight: 600; }
@media (max-width: 720px) { .tiles { grid-template-columns: repeat(2, 1fr); } }
</style>
