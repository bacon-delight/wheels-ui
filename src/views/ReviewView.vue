<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import ConfidenceBadge from '../components/ConfidenceBadge.vue'
import { api } from '../services/api'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const auth = useAuthStore()
const { eid, did, version } = route.params
const base = `/engagements/${eid}/documents/${did}/versions/${version}`

const pages = ref([])
const fields = ref([])
const needsReview = ref(0)
const selected = ref(null)
const busy = ref('')
const err = ref('')
const pageEls = ref({})

const canApprove = computed(() => auth.isProvider)

async function load() {
  try {
    const [p, f] = await Promise.all([api.get(`${base}/pages`), api.get(`${base}/fields`)])
    pages.value = p.data.pages
    fields.value = f.data.fields
    needsReview.value = f.data.needs_review_count
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
}

function selectField(f) {
  selected.value = f
  const page = f.citations?.[0]?.page
  if (page && pageEls.value[page]) {
    pageEls.value[page].scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

// Citations of the selected field that fall on a given page (for the overlay rects).
function highlightsOn(pageNum) {
  if (!selected.value) return []
  return (selected.value.citations || []).filter((c) => c.page === pageNum && c.bbox)
}

function rectStyle(bbox) {
  return {
    left: `${bbox.x0 * 100}%`,
    top: `${bbox.y0 * 100}%`,
    width: `${(bbox.x1 - bbox.x0) * 100}%`,
    height: `${(bbox.y1 - bbox.y0) * 100}%`,
  }
}

function money(n) {
  return n == null ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
}

function feeLine(fi) {
  const parts = []
  if (fi.amount != null) parts.push(money(fi.amount))
  if (fi.rate_pct != null) parts.push(`${fi.fee_type === 'cost_plus' ? 'cost + ' : ''}${fi.rate_pct}%`)
  if (fi.unit_basis) parts.push(fi.unit_basis.replace(/_/g, ' '))
  if (fi.minimum != null) parts.push(`min ${money(fi.minimum)}`)
  return parts.join(' · ') || fi.description
}

async function approve(f) {
  busy.value = f.field_id
  try {
    await api.patch(`${base}/fields/${f.service}/${f.field_id}`, { approved: true })
    await load()
    if (selected.value?.field_id === f.field_id) selected.value = null
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  busy.value = ''
}

onMounted(load)
</script>

<template>
  <div class="review">
    <div class="rhead">
      <router-link :to="`/engagements/${eid}`" class="muted">← Back to engagement</router-link>
      <div class="row">
        <span class="badge low" v-if="needsReview">{{ needsReview }} need review</span>
        <span class="badge high" v-else>All reviewed</span>
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>

    <div class="split">
      <!-- LEFT: document pages + highlight overlay -->
      <div class="doc-pane">
        <div v-for="p in pages" :key="p.page" class="page-wrap" :ref="(el) => (pageEls[p.page] = el)">
          <img :src="p.image_url" :alt="`page ${p.page}`" loading="lazy" />
          <div v-for="(c, i) in highlightsOn(p.page)" :key="i" class="hl" :style="rectStyle(c.bbox)" />
          <div class="pageno">Page {{ p.page }}</div>
        </div>
        <p v-if="!pages.length" class="muted" style="padding: 20px">Rendering pages…</p>
      </div>

      <!-- RIGHT: extracted fields, needs-review first -->
      <div class="fields-pane">
        <div
          v-for="f in fields"
          :key="f.field_id"
          class="fcard"
          :class="{ sel: selected?.field_id === f.field_id, flagged: f.needs_review, off: !f.elected }"
          @click="selectField(f)"
        >
          <div class="spread">
            <div class="row">
              <strong>{{ f.service }}</strong>
              <span v-if="!f.elected" class="pill off-pill">Not elected</span>
            </div>
            <div class="row">
              <span v-if="f.needs_review" class="badge low">review</span>
              <span v-else-if="f.approved" class="badge high">approved</span>
              <ConfidenceBadge :value="f.confidence" />
            </div>
          </div>

          <div v-if="f.notes" class="muted small">{{ f.notes }}</div>

          <ul v-if="f.fee_items?.length" class="fees">
            <li v-for="(fi, i) in f.fee_items" :key="i">
              <span>{{ feeLine(fi) }}</span>
              <span v-if="fi.description" class="muted small"> — {{ fi.description }}</span>
              <ul v-if="fi.tier_bands?.length" class="tiers">
                <li v-for="(t, j) in fi.tier_bands" :key="j">
                  units {{ t.min_units }}–{{ t.max_units ?? '∞' }}: {{ money(t.amount) }}
                </li>
              </ul>
              <div v-for="(c, k) in fi.conditions || []" :key="k" class="cond">⚑ {{ c.description }}</div>
            </li>
          </ul>

          <div v-if="f.citations?.length" class="cite muted small">
            📄 p{{ f.citations[0].page }}<span v-if="f.citations[0].section_label"> · {{ f.citations[0].section_label }}</span>
            <em v-if="f.citations[0].quote"> — “{{ f.citations[0].quote }}”</em>
          </div>

          <div v-if="canApprove && f.elected && !f.approved" class="actions">
            <button class="primary sm" :disabled="busy === f.field_id" @click.stop="approve(f)">
              {{ busy === f.field_id ? '…' : 'Approve' }}
            </button>
          </div>
        </div>
        <p v-if="!fields.length" class="muted" style="padding: 20px">No fields yet.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review { height: calc(100vh - 58px); display: flex; flex-direction: column; }
.rhead { display: flex; justify-content: space-between; align-items: center; padding: 10px 20px; border-bottom: 1px solid var(--line); background: #fff; }
.err { color: var(--risk); padding: 8px 20px; }
.split { flex: 1; display: grid; grid-template-columns: 1.2fr 1fr; min-height: 0; }
.doc-pane { overflow-y: auto; background: #dfe5e9; padding: 16px; }
.page-wrap { position: relative; max-width: 720px; margin: 0 auto 16px; box-shadow: var(--shadow); background: #fff; }
.page-wrap img { display: block; width: 100%; }
.hl {
  position: absolute; background: rgba(18, 122, 155, 0.28);
  outline: 2px solid var(--accent); border-radius: 2px;
  animation: pulse 1.2s ease-in-out 2;
}
@keyframes pulse { 0%,100% { background: rgba(18,122,155,0.18); } 50% { background: rgba(18,122,155,0.42); } }
.pageno { position: absolute; top: 6px; right: 8px; font-size: 11px; color: var(--muted); background: rgba(255,255,255,0.85); padding: 1px 6px; border-radius: 4px; }
.fields-pane { overflow-y: auto; padding: 14px; background: var(--bg); }
.fcard { background: #fff; border: 1px solid var(--line); border-left: 3px solid var(--line); border-radius: 8px; padding: 12px 14px; margin-bottom: 10px; cursor: pointer; }
.fcard:hover { border-color: var(--accent); }
.fcard.sel { border-left-color: var(--accent); box-shadow: var(--shadow); }
.fcard.flagged { border-left-color: var(--risk); }
.fcard.off { opacity: 0.72; }
.off-pill { background: #eef0f2; color: var(--muted); }
.small { font-size: 12px; }
.fees { margin: 8px 0 4px; padding-left: 18px; }
.fees li { margin-bottom: 3px; }
.tiers { margin: 2px 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
.cond { color: var(--warn); font-size: 12px; }
.cite { margin-top: 6px; }
.actions { margin-top: 8px; }
@media (max-width: 820px) { .split { grid-template-columns: 1fr; } }
</style>
