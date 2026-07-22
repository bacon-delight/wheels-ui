<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import JourneyStepper from '../../components/JourneyStepper.vue'
import { api } from '../../services/api'
import { useEngagementStore } from '../../stores/engagement'

const route = useRoute()
const eng = useEngagementStore()
const events = ref([])

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
}
const label = (a) => ACTION_LABEL[a] || a
const when = (iso) => (iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')

onMounted(async () => {
  try {
    events.value = (await api.get(`/engagements/${route.params.eid}/audit`)).data.events
  } catch {
    /* ignore */
  }
})
</script>

<template>
  <div class="stack">
    <div class="card pad">
      <h2>Approval journey</h2>
      <JourneyStepper :status="eng.status" />
    </div>

    <div class="card pad">
      <h2>Activity</h2>
      <div v-if="events.length" class="timeline">
        <div v-for="e in events" :key="e.event_id" class="ev">
          <div class="dot" />
          <div class="ebody">
            <div class="etop">
              <strong>{{ label(e.action) }}</strong>
              <span class="muted small">{{ when(e.ts) }}</span>
            </div>
            <div class="muted small">
              by {{ e.actor_role }}<span v-if="e.comment"> — “{{ e.comment }}”</span>
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
.timeline { display: flex; flex-direction: column; }
.ev { display: flex; gap: 12px; padding-bottom: 16px; position: relative; }
.ev:not(:last-child)::before { content: ''; position: absolute; left: 4px; top: 12px; bottom: 0; width: 2px; background: var(--line); }
.dot { width: 10px; height: 10px; border-radius: 999px; background: var(--accent); margin-top: 4px; flex-shrink: 0; z-index: 1; }
.etop { display: flex; justify-content: space-between; gap: 10px; }
</style>
