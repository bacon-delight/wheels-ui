<script setup>
const props = defineProps({ value: { type: Number, default: 0 } })
const tier = (v) => (v >= 0.9 ? 'high' : v >= 0.8 ? 'med' : 'low')
</script>

<template>
  <span class="badge" :class="tier(value)" :title="`confidence ${Math.round(value * 100)}%`">
    {{ Math.round(value * 100) }}%
  </span>
</template>
