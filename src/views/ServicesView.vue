<script setup>
import { computed, onMounted, ref } from 'vue'

import Dialog from '../components/Dialog.vue'
import Dropdown from '../components/Dropdown.vue'
import SidePanel from '../components/SidePanel.vue'
import { api } from '../services/api'
import { useCatalogStore } from '../stores/catalog'

// What Wheels sells, and who is buying it. The catalog is also the denominator behind every
// coverage figure on an engagement, which is why the unmatched queue lives here: each name
// promoted or linked moves that denominator, so it is a decision a person makes deliberately.
const catalog = useCatalogStore()
const loading = ref(true)
const q = ref('')
const filterCategory = ref('')
const showNew = ref(false)
const detail = ref(null)
const detailBusy = ref(false)
const form = ref({ name: '', category: '', description: '' })
const promote = ref(null)
const linkTarget = ref('')

const shown = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return catalog.programs.filter((p) => {
    if (filterCategory.value && p.category !== filterCategory.value) return false
    if (!needle) return true
    return (
      p.name.toLowerCase().includes(needle) ||
      (p.aliases || []).some((a) => a.toLowerCase().includes(needle))
    )
  })
})

const categoryOptions = computed(() => [
  { value: '', label: 'All categories' },
  ...catalog.categories.map((c) => ({ value: c, label: c })),
])

const cards = computed(() => {
  const groups = {}
  for (const p of catalog.programs) {
    const key = p.category || 'Uncategorised'
    const g = (groups[key] ||= { key, count: 0, inUse: 0, items: 0 })
    g.count += 1
    g.items += p.item_count
    if (p.engagement_count) g.inUse += 1
  }
  return Object.values(groups)
    .sort((a, b) => b.count - a.count)
    .map((g) => ({ ...g, share: g.count ? Math.round((100 * g.inUse) / g.count) : 0 }))
})

async function open(program) {
  detailBusy.value = true
  detail.value = { program, items: [], engagements: [], customers: [] }
  try {
    const { data } = await api.get(`/services/${program.program_id}`)
    detail.value = data
  } catch {
    /* the row still opens; the panel simply shows what we have */
  }
  detailBusy.value = false
}

async function create() {
  await catalog.create({
    name: form.value.name.trim(),
    category: form.value.category || null,
    description: form.value.description || null,
  })
  if (!catalog.err) {
    showNew.value = false
    form.value = { name: '', category: '', description: '' }
  }
}

function pickCategory(key) {
  filterCategory.value = filterCategory.value === key ? '' : key
}

onMounted(async () => {
  await Promise.all([catalog.load(true), catalog.loadUnmatched()])
  loading.value = false
})
</script>

<template>
  <div class="page">
    <div class="spread head">
      <div>
        <h1>Services</h1>
        <p class="muted" style="margin: 4px 0 0">
          Every service Wheels sells, and which customers buy it. Contracts name these
          differently, so each entry keeps the other wordings it is known by.
        </p>
      </div>
      <button class="primary nowrap" @click="showNew = true">＋ Add service</button>
    </div>

    <p v-if="catalog.err" class="err">{{ catalog.err }}</p>
    <p v-if="loading" class="muted">Loading…</p>

    <template v-else>
      <div class="grid tiles">
        <div class="stattile"><div class="label">Services</div><div class="val">{{ catalog.totals.programs }}</div></div>
        <div class="stattile"><div class="label">Priced items</div><div class="val">{{ catalog.totals.items }}</div></div>
        <div class="stattile"><div class="label">In use</div><div class="val">{{ catalog.totals.in_use }}</div></div>
        <div class="stattile">
          <div class="label">Not yet sold</div>
          <div class="val">{{ catalog.totals.programs - catalog.totals.in_use }}</div>
        </div>
        <div class="stattile" :class="{ warn: catalog.unmatched.length }">
          <div class="label">Unrecognised names</div>
          <div class="val">{{ catalog.unmatched.length }}</div>
        </div>
      </div>

      <!-- Names extraction found that the catalog does not know. Never auto-created: every
           promotion changes the denominator every coverage number is measured against. -->
      <div v-if="catalog.unmatched.length" class="card pad queue">
        <h2 style="margin: 0 0 4px">Names we did not recognise</h2>
        <p class="muted small" style="margin: 0 0 14px">
          Found in a contract but not in the catalog. Until one is placed, it is shown on the
          engagement but does not count toward coverage.
        </p>
        <div v-for="u in catalog.unmatched" :key="u.normalised" class="urow">
          <div class="uinfo">
            <strong>{{ u.raw }}</strong>
            <span class="muted small">seen {{ u.count }}×</span>
          </div>
          <div class="uacts">
            <div class="fw">
              <Dropdown
                v-model="linkTarget"
                :options="catalog.options"
                placeholder="Another name for…"
                @update:model-value="(v) => v && catalog.linkUnmatched(u.normalised, v)"
              />
            </div>
            <button class="ghost sm" :disabled="!!catalog.busy" @click="promote = u">
              Add as new
            </button>
          </div>
        </div>
      </div>

      <div class="grid cats">
        <button
          v-for="c in cards"
          :key="c.key"
          class="card scard"
          :class="{ on: filterCategory === c.key }"
          type="button"
          @click="pickCategory(c.key)"
        >
          <div class="spread"><span class="label">{{ c.key }}</span><span class="muted small">{{ c.share }}%</span></div>
          <div class="val">{{ c.count }}<span class="per">services</span></div>
          <div class="track"><div class="fill" :style="{ width: c.share + '%' }" /></div>
          <div class="muted small">{{ c.inUse }} sold · {{ c.items }} items</div>
        </button>
      </div>

      <div class="card">
        <div class="row filters">
          <input v-model="q" placeholder="Search services…" class="search" />
          <div class="fw"><Dropdown v-model="filterCategory" :options="categoryOptions" placeholder="All categories" /></div>
          <span class="muted small" style="margin-left: auto">{{ shown.length }} of {{ catalog.programs.length }}</span>
        </div>
        <div class="twrap">
          <table>
            <thead>
              <tr>
                <th>Service</th><th>Category</th><th class="r">Items</th>
                <th class="r">Engagements</th><th class="r">Contracts</th><th>Also called</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in shown" :key="p.program_id" class="clickable" @click="open(p)">
                <td><span class="ename">{{ p.name }}</span></td>
                <td class="muted">{{ p.category || '—' }}</td>
                <td class="r mono">{{ p.item_count }}</td>
                <td class="r mono">
                  <span v-if="p.engagement_count" class="badge ok">{{ p.engagement_count }}</span>
                  <span v-else class="muted">—</span>
                </td>
                <td class="r mono muted">{{ p.contract_count }}</td>
                <td class="muted small alias">{{ (p.aliases || []).slice(0, 2).join(' · ') || '—' }}</td>
              </tr>
              <tr v-if="!shown.length"><td colspan="6" class="muted" style="padding: 18px">No services match.</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <SidePanel
      :open="!!detail"
      :title="detail?.program?.name || ''"
      :subtitle="detail?.program?.category || 'Service'"
      @close="detail = null"
    >
      <template v-if="detail">
        <p v-if="detailBusy" class="muted">Loading…</p>
        <div class="label" style="margin-bottom: 8px">
          {{ detail.items?.length || 0 }} priced item{{ detail.items?.length === 1 ? '' : 's' }}
        </div>
        <div v-for="i in detail.items || []" :key="i.item_id" class="iline">{{ i.name }}</div>
        <p v-if="!detail.items?.length" class="muted small">No priced items recorded yet.</p>

        <div class="label" style="margin: 20px 0 8px">
          Used by {{ detail.engagements?.length || 0 }} engagement{{ detail.engagements?.length === 1 ? '' : 's' }}
        </div>
        <router-link
          v-for="e in detail.engagements || []"
          :key="e.engagement_id"
          :to="`/engagements/${e.engagement_id}`"
          class="eline"
        >
          <span>{{ e.name }}</span>
          <span class="muted small">{{ e.client_name }}</span>
        </router-link>
        <p v-if="!detail.engagements?.length" class="muted small">
          No engagement's agreements price this service yet.
        </p>

        <div v-if="detail.program?.aliases?.length" class="label" style="margin: 20px 0 8px">Also called</div>
        <div v-for="a in detail.program?.aliases || []" :key="a" class="iline muted">{{ a }}</div>
      </template>
    </SidePanel>

    <Dialog
      :open="showNew"
      title="Add a service"
      subtitle="It becomes part of the catalog every engagement's coverage is measured against."
      @close="showNew = false"
    >
      <label class="fld"><span class="label">Name</span><input v-model="form.name" placeholder="Home Charger Program" /></label>
      <label class="fld" style="margin-top: 14px"><span class="label">Category</span><input v-model="form.category" placeholder="Electrification" /></label>
      <label class="fld" style="margin-top: 14px"><span class="label">Description</span><textarea v-model="form.description" rows="2" /></label>
      <p v-if="catalog.err" class="err">{{ catalog.err }}</p>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="showNew = false">Cancel</button>
        <button class="primary" :disabled="!form.name || !!catalog.busy" @click="create">
          {{ catalog.busy === 'create' ? 'Adding…' : 'Add service' }}
        </button>
      </template>
    </Dialog>

    <Dialog
      :open="!!promote"
      title="Add this as a new service?"
      :subtitle="promote ? `“${promote.raw}” was found in a contract but is not in the catalog.` : ''"
      @close="promote = null"
    >
      <p class="muted small" style="margin: 0">
        Adding it raises the number every engagement's coverage is measured against, so add it
        only if it really is a service of its own rather than another name for one we have.
      </p>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="promote = null">Cancel</button>
        <button
          class="primary"
          :disabled="!!catalog.busy"
          @click="catalog.promoteUnmatched(promote.normalised, { name: promote.raw }).then(() => (promote = null))"
        >Add as a service</button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.page { max-width: 1680px; margin: 0 auto; padding: 32px; display: flex; flex-direction: column; gap: 16px; }
.head { margin-bottom: 4px; align-items: flex-start; }
.head h1 { margin: 0; }
.nowrap { white-space: nowrap; }
.small { font-size: 12px; }
.mono { font-variant-numeric: tabular-nums; }
.r { text-align: right; }
.pad { padding: 20px 22px; }
.err { color: var(--risk); }
.fld { display: flex; flex-direction: column; gap: 6px; }
.tiles { grid-template-columns: repeat(5, 1fr); }
.stattile.warn .val { color: var(--warn); }
.cats { grid-template-columns: repeat(5, 1fr); }
.scard { padding: 16px 18px; text-align: left; cursor: pointer; border: 1px solid var(--line); background: var(--panel); display: flex; flex-direction: column; gap: 8px; transition: border-color .15s ease; }
.scard:hover { border-color: var(--line-strong); }
.scard.on { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
.scard .val { font-family: var(--serif); font-size: 24px; font-weight: 600; line-height: 1; }
.per { font-family: var(--sans); font-size: 13px; color: var(--muted); margin-left: 5px; font-weight: 400; }
.track { height: 6px; background: var(--line); border-radius: 999px; overflow: hidden; }
.fill { height: 100%; border-radius: 999px; background: #1d5cb0; min-width: 2px; }
.queue { border-left: 3px solid var(--warn); }
.urow { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 10px 0; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.urow:last-child { border-bottom: none; }
.uinfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.uacts { display: flex; align-items: center; gap: 10px; }
.filters { gap: 10px; padding: 16px 20px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.search { width: 260px; }
.fw { width: 230px; }
.twrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 11px 20px; border-top: 1px solid var(--line); font-size: 13px; vertical-align: middle; }
th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 600; border-top: none; }
.clickable { cursor: pointer; }
.clickable:hover { background: var(--panel-2, #f6f8fb); }
.ename { font-weight: 600; color: var(--ink); }
.alias { max-width: 280px; }
.iline { padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
.eline { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--line); text-decoration: none; color: var(--ink); font-size: 13px; }
.eline:hover { color: var(--accent-ink); }
@media (max-width: 1200px) { .cats { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 1000px) { .tiles { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 640px) { .tiles, .cats { grid-template-columns: repeat(2, 1fr); } .search { width: 100%; } }
</style>
