<script setup>
/**
 * Centred modal, following the Ecosphere design system's Dialog: scrim and panel are siblings
 * so they transition independently, the panel rises 14px and scales from .97, and the footer
 * sits on a sunken band. Ecosphere ships no JavaScript, so escape-to-close, click-outside,
 * focus handling and scroll lock are implemented here.
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },
  wide: { type: Boolean, default: false },
})
const emit = defineEmits(['close'])

const panel = ref(null)
const titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`
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
      // Land on the first real control rather than the panel, so typing starts immediately.
      const first = panel.value?.querySelector('input, select, textarea, button')
      ;(first || panel.value)?.focus()
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
  <div class="dlgscrim" :class="{ 'is-open': open }" @click="emit('close')" />
  <div
    ref="panel"
    class="dlg"
    :class="{ 'is-open': open, 'dlg--wide': wide }"
    role="dialog"
    aria-modal="true"
    :aria-labelledby="titleId"
    tabindex="-1"
  >
    <div class="dlg__h">
      <h2 class="dlg__t" :id="titleId">{{ title }}</h2>
      <p v-if="subtitle" class="dlg__s">{{ subtitle }}</p>
      <button class="dlg__x ghost sm" type="button" aria-label="Close" @click="emit('close')">✕</button>
    </div>
    <div class="dlg__body"><slot /></div>
    <div v-if="$slots.footer" class="dlg__f"><slot name="footer" /></div>
  </div>
</template>

<style scoped>
.dlgscrim {
  position: fixed;
  inset: 0;
  z-index: 70;
  background: rgba(4, 20, 65, 0.55);
  -webkit-backdrop-filter: blur(14px) saturate(1.1);
  backdrop-filter: blur(14px) saturate(1.1);
  opacity: 0;
  pointer-events: none;
  transition: opacity 340ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.dlgscrim.is-open { opacity: 1; pointer-events: auto; }

.dlg {
  position: fixed;
  z-index: 75;
  top: 50%;
  left: 50%;
  width: min(560px, calc(100vw - 28px));
  max-height: min(660px, calc(100vh - 72px));
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 20px;
  box-shadow: 0 34px 90px -30px rgba(4, 20, 65, 0.34), 0 2px 6px rgba(4, 20, 65, 0.06);
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
  transform: translate(-50%, -50%) translateY(14px) scale(0.97);
  transition: opacity 340ms cubic-bezier(0.22, 0.61, 0.36, 1),
              transform 340ms cubic-bezier(0.22, 0.61, 0.36, 1),
              visibility 0s linear 340ms;
}
.dlg.is-open {
  opacity: 1;
  pointer-events: auto;
  visibility: visible;
  transform: translate(-50%, -50%);
  transition-delay: 0s, 0s, 0s;
}
.dlg--wide { width: min(760px, calc(100vw - 28px)); }
.dlg:focus { outline: none; }

.dlg__h { position: relative; flex: 0 0 auto; padding: 24px 24px 0; }
.dlg__t { margin: 0; font-size: 21px; line-height: 1.2; }
.dlg__s { margin: 8px 0 0; font-size: 13.5px; line-height: 1.5; color: var(--muted); max-width: 52ch; }
.dlg__x { position: absolute; top: 18px; right: 16px; }
.dlg__body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 24px 22px; }
.dlg__f {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid var(--line);
  background: var(--panel-2);
  border-radius: 0 0 20px 20px;
}
/* Alignment comes from a push element, so a note can sit on the left when there is one. */
.dlg__f :deep(.sp) { margin-left: auto; }

@media (max-width: 767px) {
  .dlg__h, .dlg__body, .dlg__f { padding-left: 18px; padding-right: 18px; }
  .dlg__f { flex-wrap: wrap; }
}
@media (prefers-reduced-motion: reduce) { .dlgscrim, .dlg { transition-duration: 0.01ms; } }
</style>
