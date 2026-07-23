<script setup>
import { ref, watch } from 'vue'

import { api } from '../services/api'
import { prettyService } from '../stores/engagement'

const props = defineProps({
  eid: { type: String, required: true },
  sid: { type: String, required: true },
  status: { type: String, default: '' },
})

const data = ref(null)

const STATUS = {
  applied: { label: 'Applied', cls: 'ok' },
  partial: { label: 'Partial', cls: 'warn' },
  not_applied: { label: 'Not applied', cls: 'risk' },
  unrelated: { label: 'Not requested', cls: 'info' },
  new: { label: 'Changed', cls: 'info' },
}

async function load() {
  if (!props.sid) return
  try {
    data.value = (await api.get(`/engagements/${props.eid}/submissions/${props.sid}/change-review`)).data
  } catch {
    data.value = null
  }
}
watch(() => [props.sid, props.status], load, { immediate: true })
</script>

<template>
  <div v-if="data && data.applicable" class="card pad cr">
    <div class="spread" style="margin-bottom: 6px">
      <h2 style="margin: 0">Change verification</h2>
      <span class="badge info">Re-upload vs client request</span>
    </div>
    <p v-if="data.requested" class="muted small" style="margin: 0 0 8px">
      Client asked: <em>“{{ data.requested }}”</em>
    </p>
    <p v-if="data.overall" class="overall">{{ data.overall }}</p>

    <div v-for="(it, i) in data.items" :key="i" class="cri" :class="{ flag: it.status === 'partial' || it.status === 'not_applied' }">
      <div class="crhead">
        <strong>{{ prettyService(it.service) }}</strong>
        <span class="badge" :class="STATUS[it.status]?.cls || 'info'">{{ STATUS[it.status]?.label || it.status }}</span>
      </div>
      <div class="crbody">
        <div v-if="it.requested"><span class="muted">Requested:</span> {{ it.requested }}</div>
        <div v-if="it.delivered"><span class="muted">Delivered:</span> {{ it.delivered }}</div>
        <div v-if="it.note" class="note">{{ it.note }}</div>
      </div>
    </div>
    <p v-if="!data.items.length" class="muted small" style="margin: 0">No field-level differences detected between the two versions.</p>
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.cr { border-left: 3px solid var(--warn); }
.overall { margin: 0 0 12px; font-size: 15px; line-height: 1.5; }
.cri { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; }
.cri.flag { border-color: var(--warn); background: var(--warn-weak); }
.crhead { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 6px; }
.crbody { font-size: 13px; line-height: 1.6; }
.note { color: var(--ink-soft); margin-top: 4px; }
</style>
