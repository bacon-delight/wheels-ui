<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { api } from '../services/api'

const route = useRoute()
const router = useRouter()
const { eid, did, version } = route.params
const pages = ref([])
const loaded = ref(false)

onMounted(async () => {
  try {
    pages.value = (await api.get(`/engagements/${eid}/documents/${did}/versions/${version}/pages`)).data.pages
  } catch {
    /* ignore */
  } finally {
    loaded.value = true
  }
})
</script>

<template>
  <div class="src">
    <div class="head">
      <button class="ghost sm" @click="router.back()">← Back</button>
      <span class="muted small">Source document</span>
    </div>
    <div class="pages">
      <div v-for="p in pages" :key="p.page" class="page-wrap">
        <img :src="p.image_url" :alt="`page ${p.page}`" loading="lazy" />
        <div class="pageno">Page {{ p.page }}</div>
      </div>
      <p v-if="!pages.length && loaded" class="muted" style="padding: 30px; text-align: center">
        This document hasn't been processed yet.
      </p>
      <p v-else-if="!pages.length" class="muted" style="padding: 30px; text-align: center">Loading…</p>
    </div>
  </div>
</template>

<style scoped>
.src { height: 100vh; display: flex; flex-direction: column; }
.head { display: flex; align-items: center; gap: 12px; padding: 12px 24px; border-bottom: 1px solid var(--line); background: var(--panel); }
.small { font-size: 12px; }
.pages { flex: 1; overflow-y: auto; padding: 24px; background: #eceae4; }
.page-wrap { position: relative; max-width: 760px; margin: 0 auto 18px; box-shadow: var(--shadow); background: #fff; border-radius: 4px; overflow: hidden; }
.page-wrap img { display: block; width: 100%; }
.pageno { position: absolute; top: 8px; right: 10px; font-size: 11px; color: var(--muted); background: rgba(255, 255, 255, 0.9); padding: 2px 8px; border-radius: 6px; }
</style>
