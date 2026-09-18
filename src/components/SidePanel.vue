<script setup>
/**
 * Right-edge drawer, following the Ecosphere design system's Drawer:
 * inset from three edges so it reads as a floating card, a lighter unblurred scrim than a
 * modal, and a slide with the visibility trick that keeps the closed panel out of the tab
 * order without killing the exit transition.
 *
 * Ecosphere ships no JavaScript, so escape-to-close, click-outside, focus handling and scroll
 * lock are implemented here.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const panel = ref(null)
const titleId = `sp-${Math.random().toString(36).slice(2, 9)}`
let lastFocused = null

function onKey(e) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      lastFocused = document.activeElement
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
      await nextTick()
      panel.value?.focus()
    } else {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      lastFocused?.focus?.()
    }
  },
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <!-- Scrim is a sibling of the panel, not its parent, so the two transition independently. -->
  <div class="spscrim" :class="{ 'is-open': open }" @click="emit('close')" />
  <aside
    ref="panel"
    class="sidepanel"
    :class="{ 'is-open': open }"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    tabindex="-1"
  >
    <div class="sp__head">
      <div class="sp__titles">
        <h2 class="sp__t" :id="titleId">{{ title }}</h2>
        <p v-if="subtitle" class="sp__s">{{ subtitle }}</p>
      </div>
      <slot name="header-extra" />
      <button class="sp__x ghost sm" type="button" aria-label="Close" @click="emit('close')">✕</button>
    </div>
    <div class="sp__body"><slot /></div>
    <div v-if="$slots.footer" class="sp__f"><slot name="footer" /></div>
  </aside>
</template>

<style scoped>
.spscrim {
  position: fixed;
  inset: 0;
  z-index: 45;
  background: rgba(4, 20, 65, 0.28);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.spscrim.is-open { opacity: 1; pointer-events: auto; }

.sidepanel {
  position: fixed;
  top: 18px;
  right: 18px;
  bottom: 18px;
  z-index: 75;
  width: min(64vw, 720px);
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 34px 90px -30px rgba(4, 20, 65, 0.34), 0 2px 6px rgba(4, 20, 65, 0.06);
  overflow: hidden;
  transform: translateX(calc(100% + 24px));
  visibility: hidden;
  /* Delay the hide until the slide-out finishes, so the closed panel leaves the tab order
     without the exit transition being cut short. */
  transition: transform 340ms cubic-bezier(0.22, 0.61, 0.2, 1), visibility 0s linear 340ms;
}
.sidepanel.is-open { transform: none; visibility: visible; transition-delay: 0s, 0s; }
.sidepanel:focus { outline: none; }

.sp__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--line);
  flex: 0 0 auto;
}
.sp__titles { flex: 1; min-width: 0; }
.sp__t { margin: 0; font-size: 18px; }
.sp__s { margin: 4px 0 0; font-size: 13px; color: var(--muted); line-height: 1.5; }
.sp__x { flex: 0 0 auto; }
.sp__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 20px; }
.sp__f { flex: 0 0 auto; padding: 14px 20px; border-top: 1px solid var(--line); background: var(--panel-2); }

@media (max-width: 1023px) { .sidepanel { width: auto; left: 18px; } }
@media (max-width: 767px) { .sidepanel { inset: 0; width: auto; border-radius: 0; border: 0; } }
@media (prefers-reduced-motion: reduce) {
  .spscrim, .sidepanel { transition-duration: 0.01ms; }
}
</style>
