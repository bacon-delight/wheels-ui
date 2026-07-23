<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import { api } from '../../services/api'

const route = useRoute()
const data = ref(null)
const loading = ref(true)

const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString(undefined, {
        day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : ''
const side = (role) => (role === 'client' ? 'client' : role === 'system' ? 'system' : 'provider')
const initials = (m) =>
  (m.actor_name || m.actor_role || '?').split(/[\s@.]+/).slice(0, 2).map((s) => s[0]?.toUpperCase() || '').join('')

onMounted(async () => {
  try {
    data.value = (await api.get(`/engagements/${route.params.eid}/summary`)).data
  } catch {
    data.value = null
  }
  loading.value = false
})
</script>

<template>
  <div class="stack">
    <div class="card pad">
      <div class="spread" style="margin-bottom: 8px">
        <h2 style="margin: 0">Negotiation summary</h2>
        <span class="badge info">AI summary</span>
      </div>
      <p v-if="loading" class="muted">Summarizing the back-and-forth…</p>
      <template v-else-if="data && data.summary">
        <p class="summary">{{ data.summary }}</p>
        <ul v-if="data.highlights?.length" class="hl">
          <li v-for="(h, i) in data.highlights" :key="i">{{ h }}</li>
        </ul>
      </template>
      <p v-else class="muted" style="margin: 0">Nothing to summarize yet.</p>
    </div>

    <div class="card pad" v-if="data?.thread?.length">
      <h2>Conversation</h2>
      <p class="muted small" style="margin: -6px 0 16px">Every request, response, and decision on this engagement, in order.</p>
      <div class="thread">
        <div v-for="(m, i) in data.thread" :key="i" class="msg" :class="side(m.actor_role)">
          <div class="ava">{{ initials(m) }}</div>
          <div class="bubble">
            <div class="mhead"><strong>{{ m.label }}</strong></div>
            <p v-if="m.comment" class="mcomment">“{{ m.comment }}”</p>
            <div class="meta">{{ m.actor_name || m.actor_role }} · {{ when(m.ts) }}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card pad" v-else-if="!loading"><p class="muted" style="margin: 0">No communication yet.</p></div>
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.summary { font-size: 16px; line-height: 1.6; margin: 0; }
.hl { margin: 14px 0 0; padding-left: 20px; }
.hl li { margin-bottom: 6px; line-height: 1.5; }
.thread { display: flex; flex-direction: column; gap: 14px; }
.msg { display: flex; gap: 10px; max-width: 78%; }
.msg.provider { align-self: flex-end; flex-direction: row-reverse; }
.msg.client { align-self: flex-start; }
.msg.system { align-self: center; max-width: 90%; opacity: 0.85; }
.ava { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; font-size: 11px; font-weight: 700; flex-shrink: 0; background: var(--panel-2); color: var(--ink-soft); }
.msg.provider .ava { background: var(--accent); color: #fff; }
.msg.client .ava { background: var(--accent-weak); color: var(--accent-ink); }
.bubble { background: var(--panel-2); border: 1px solid var(--line); border-radius: 14px; padding: 10px 14px; }
.msg.provider .bubble { background: var(--accent-weak); border-color: transparent; }
.msg.system .bubble { background: transparent; border-style: dashed; text-align: center; }
.mhead { font-size: 14px; }
.mcomment { margin: 4px 0; font-size: 14px; line-height: 1.5; font-style: italic; }
.meta { font-size: 11px; color: var(--muted); margin-top: 4px; }
</style>
