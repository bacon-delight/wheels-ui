<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'

import Dropdown from '../../components/Dropdown.vue'
import { api } from '../../services/api'
import { useEngagementStore } from '../../stores/engagement'

// Which of Wheels' services this customer actually buys, read off their agreements. A service
// counts when a priced term resolves to it — whether or not it carries a charge, because a
// contract that names a programme and charges nothing for it is still a service they receive.
const route = useRoute()
const eng = useEngagementStore()
const data = ref(null)
const err = ref('')
const loading = ref(true)
const filter = ref('availed')
const expanded = ref({})

const FILTERS = [
  { value: 'availed', label: 'In this agreement' },
  { value: 'all', label: 'Every service' },
  { value: 'not', label: 'Not in this agreement' },
]

const rows = computed(() => {
  const all = data.value?.rows || []
  if (filter.value === 'availed') return all.filter((r) => r.availed)
  if (filter.value === 'not') return all.filter((r) => !r.availed)
  return all
})
const pct = computed(() => {
  const p = data.value?.programs
  return p?.total ? Math.round((100 * p.availed) / p.total) : 0
})
const byCategory = computed(() => {
  const groups = {}
  for (const r of data.value?.rows || []) {
    if (!r.availed) continue
    const key = r.category || 'Other'
    groups[key] = (groups[key] || 0) + 1
  }
  return Object.entries(groups).sort((a, b) => b[1] - a[1])
})

function toggle(row) {
  if (!row.availed) return
  expanded.value = { ...expanded.value, [row.program_id]: !expanded.value[row.program_id] }
}

// The priced terms behind one service, pulled from the terms already loaded for this
// engagement rather than fetched again.
function itemsFor(programId) {
  return eng
    .termsIn('pricing')
    .filter((t) => t.program_id === programId)
    .map((t) => ({
      key: t.record_id,
      name: t.record?.item || t.title,
      amount: t.amount,
      frequency: t.record?.frequency,
    }))
}

const money = (n) =>
  n == null ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

onMounted(async () => {
  try {
    data.value = (await api.get(`/engagements/${route.params.eid}/coverage`)).data
  } catch (e) {
    err.value = e.response?.data?.detail || e.message
  }
  loading.value = false
})
</script>

<template>
  <div class="stack">
    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-else-if="data">
      <div class="card pad">
        <div class="spread" style="align-items: flex-start">
          <div>
            <h2 style="margin: 0">Services in this agreement</h2>
            <p class="muted small" style="margin: 6px 0 0; max-width: 60ch">
              Counted from the priced terms we read out of the agreements on file. A service
              counts whether or not it carries a separate charge.
            </p>
          </div>
          <div class="fw">
            <Dropdown v-model="filter" :options="FILTERS" />
          </div>
        </div>

        <div class="headline">
          <span class="big">{{ data.programs.availed }}</span>
          <span class="of">of {{ data.programs.total }} services</span>
          <span class="dot">·</span>
          <span class="items">{{ data.items.availed }} of {{ data.items.total }} priced items</span>
        </div>
        <div class="track"><div class="fill" :style="{ width: pct + '%' }" /></div>

        <div v-if="byCategory.length" class="chips">
          <span v-for="[name, n] in byCategory" :key="name" class="chip">{{ name }} <b>{{ n }}</b></span>
        </div>
      </div>

      <div class="card">
        <div class="srow" v-for="r in rows" :key="r.program_id" :class="{ off: !r.availed, open: expanded[r.program_id] }">
          <button class="shead" type="button" @click="toggle(r)">
            <span class="mark" :class="{ on: r.availed }">{{ r.availed ? '✓' : '' }}</span>
            <span class="sname">{{ r.name }}</span>
            <span class="muted small cat">{{ r.category || '' }}</span>
            <span v-if="r.availed" class="muted small count">
              {{ r.priced_items }} priced item{{ r.priced_items === 1 ? '' : 's' }}
            </span>
            <span v-else class="muted small count">not in this agreement</span>
            <span v-if="r.availed" class="caret">{{ expanded[r.program_id] ? '▾' : '▸' }}</span>
          </button>

          <div v-if="expanded[r.program_id]" class="items-list">
            <div v-for="i in itemsFor(r.program_id)" :key="i.key" class="iline">
              <span>{{ i.name }}</span>
              <span class="muted small">
                <template v-if="i.amount != null">{{ money(i.amount) }}</template>
                <template v-if="i.frequency"> {{ i.frequency }}</template>
                <template v-if="i.amount == null && !i.frequency">included</template>
              </span>
            </div>
            <p v-if="!itemsFor(r.program_id).length" class="muted small" style="padding: 8px 0">
              Named in the agreement with no separate charge.
            </p>
          </div>
        </div>
        <p v-if="!rows.length" class="muted" style="padding: 18px">Nothing to show for this filter.</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.err { color: var(--risk); }
.fw { width: 220px; }
.headline { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; margin: 18px 0 10px; }
.big { font-family: var(--serif); font-size: 34px; font-weight: 600; line-height: 1; }
.of { font-size: 15px; color: var(--ink-soft); }
.dot { color: var(--muted); }
.items { font-size: 14px; color: var(--muted); }
.track { height: 8px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; background: var(--ok); min-width: 3px; transition: width .3s; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
.chip { font-size: 12px; background: var(--panel-2, #eef1f5); color: var(--muted); border-radius: 999px; padding: 3px 10px; }
.chip b { color: var(--ink); }
.srow { border-top: 1px solid var(--line); }
.srow:first-child { border-top: none; }
.shead { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: none; padding: 12px 20px; font: inherit; text-align: left; cursor: pointer; }
.srow.off .shead { cursor: default; }
.srow.off { opacity: 0.6; }
.shead:hover { background: var(--panel-2, #f6f8fb); }
.srow.off .shead:hover { background: none; }
.mark { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--line-strong); display: grid; place-items: center; font-size: 11px; color: transparent; flex-shrink: 0; }
.mark.on { background: var(--ok-weak); border-color: var(--ok); color: var(--ok); }
.sname { font-weight: 600; }
.cat { margin-left: 2px; }
.count { margin-left: auto; }
.caret { color: var(--muted); font-size: 11px; }
.items-list { padding: 0 20px 14px 50px; }
.iline { display: flex; justify-content: space-between; gap: 14px; padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.iline:last-child { border-bottom: none; }
</style>
