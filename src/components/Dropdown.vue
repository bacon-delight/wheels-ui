<script setup>
/**
 * Single-select dropdown, following the Ecosphere design system's SelectButton + Menu:
 * a `.selbtn` disclosure button (40px, matched to the text input so the two sit in a grid
 * without a seam) opening an absolutely-positioned `.menu` 8px below it, with every option
 * rendering its own tick so widths do not shift when the selection changes.
 *
 * Ecosphere ships no JavaScript, so open/close, escape, click-outside, roving focus, type-ahead
 * and edge-flipping are implemented here. Roles are listbox/option rather than the system's
 * menu/menuitem, which is the correct mapping for a value picker; the visuals are unaffected.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number, null], default: '' },
  // [{ value, label, hint? }] — `hint` renders as a muted second column.
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Select…' },
  disabled: { type: Boolean, default: false },
  // The system's own threshold: give the menu a search once a list can exceed ~10 options.
  searchable: { type: Boolean, default: null },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const query = ref('')
const active = ref(-1)
const root = ref(null)
const menuEl = ref(null)
const list = ref(null)
const searchInput = ref(null)
// The menu is teleported to <body> so a dialog's scrolling body cannot clip it or be stretched
// by it. That means it is positioned against the viewport, not the trigger's parent.
const pos = ref({ top: 0, left: 0, width: 0, flip: false })

function place() {
  const el = root.value?.querySelector('.selbtn')
  if (!el) return
  const r = el.getBoundingClientRect()
  const below = window.innerHeight - r.bottom
  const flip = below < 280 && r.top > below
  pos.value = {
    top: flip ? r.top - 8 : r.bottom + 8,
    left: Math.min(r.left, window.innerWidth - r.width - 8),
    width: r.width,
    flip,
  }
}

const showSearch = computed(() =>
  props.searchable === null ? props.options.length > 10 : props.searchable,
)
const selected = computed(() => props.options.find((o) => o.value === props.modelValue))
const label = computed(() => selected.value?.label ?? props.placeholder)
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => String(o.label).toLowerCase().includes(q))
})

function toggle() {
  if (props.disabled) return
  open.value ? close() : show()
}

async function show() {
  place()
  open.value = true
  query.value = ''
  active.value = Math.max(0, filtered.value.findIndex((o) => o.value === props.modelValue))
  await nextTick()
  place()
  if (showSearch.value) searchInput.value?.focus()
  scrollActiveIntoView()
}

function close() {
  open.value = false
}

function pick(option) {
  emit('update:modelValue', option.value)
  close()
  root.value?.querySelector('.selbtn')?.focus()
}

function scrollActiveIntoView() {
  const el = list.value?.children[active.value]
  el?.scrollIntoView({ block: 'nearest' })
}

function onKey(e) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown'].includes(e.key)) {
      e.preventDefault()
      show()
    }
    return
  }
  if (e.key === 'Escape') {
    e.preventDefault()
    close()
    root.value?.querySelector('.selbtn')?.focus()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    active.value = Math.min(filtered.value.length - 1, active.value + 1)
    scrollActiveIntoView()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    active.value = Math.max(0, active.value - 1)
    scrollActiveIntoView()
  } else if (e.key === 'Home') {
    e.preventDefault()
    active.value = 0
    scrollActiveIntoView()
  } else if (e.key === 'End') {
    e.preventDefault()
    active.value = filtered.value.length - 1
    scrollActiveIntoView()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const o = filtered.value[active.value]
    if (o) pick(o)
  }
}

function onDocClick(e) {
  if (!open.value) return
  // The menu lives outside the component's DOM now, so both roots have to be checked.
  const inTrigger = root.value?.contains(e.target)
  const inMenu = menuEl.value?.contains(e.target)
  if (!inTrigger && !inMenu) close()
}

// A teleported menu does not travel with the page, so follow the trigger while open.
function onReflow() {
  if (open.value) place()
}

watch(open, (isOpen) => {
  const fn = isOpen ? 'addEventListener' : 'removeEventListener'
  document[fn]('mousedown', onDocClick)
  window[fn]('scroll', onReflow, true)
  window[fn]('resize', onReflow)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocClick)
  window.removeEventListener('scroll', onReflow, true)
  window.removeEventListener('resize', onReflow)
})
</script>

<template>
  <div ref="root" class="dd" @keydown="onKey">
    <button
      class="selbtn"
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="selbtn__v" :class="{ ph: !selected }">{{ label }}</span>
      <svg class="selbtn__c" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>

    <Teleport to="body">
      <div
        ref="menuEl"
        class="menu"
        :class="{ 'is-open': open, 'menu--up': pos.flip }"
        :style="{ top: pos.top + 'px', left: pos.left + 'px', minWidth: pos.width + 'px' }"
        role="listbox"
      >
      <div v-if="showSearch" class="menu__find">
        <input
          ref="searchInput"
          v-model="query"
          type="text"
          :placeholder="`Search ${options.length} options…`"
          aria-label="Filter options"
          @keydown.stop="onKey"
        />
      </div>
      <div ref="list" class="menu__list">
        <button
          v-for="(o, i) in filtered"
          :key="o.value"
          class="menu__opt"
          :class="{ on: o.value === modelValue, active: i === active }"
          type="button"
          role="option"
          :aria-selected="o.value === modelValue"
          @click="pick(o)"
          @mousemove="active = i"
        >
          <span class="lbl">{{ o.label }}</span>
          <span v-if="o.hint" class="menu__n">{{ o.hint }}</span>
          <!-- Every option renders a tick; only the selected one is opaque, so option widths
               stay identical whichever is chosen. -->
          <svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7" /></svg>
        </button>
      </div>
        <p v-if="!filtered.length" class="menu__empty">No options match “{{ query }}”.</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.dd { position: relative; }

.selbtn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--panel);
  font: inherit;
  font-weight: 400;
  color: var(--ink);
  text-align: left;
  cursor: pointer;
  transition: border-color 180ms cubic-bezier(0.22, 0.61, 0.36, 1),
              box-shadow 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.selbtn:hover { border-color: var(--muted); background: var(--panel); }
.selbtn:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-weak);
}
.selbtn:disabled { opacity: 0.45; cursor: not-allowed; }
.selbtn__v { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.selbtn__v.ph { color: var(--muted); }
.selbtn__c {
  width: 14px; height: 14px; flex: 0 0 auto; margin-left: auto; color: var(--muted);
  fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  transition: transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.selbtn[aria-expanded='true'] .selbtn__c { transform: rotate(180deg); }

.menu {
  position: fixed;
  /* Above the dialog panel (75) and its scrim (70), since it may open from inside one. */
  z-index: 90;
  max-width: calc(100vw - 20px);
  padding: 6px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 16px;
  box-shadow: 0 12px 34px rgba(4, 20, 65, 0.12), 0 1px 2px rgba(4, 20, 65, 0.05);
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  pointer-events: none;
  transition: opacity 180ms cubic-bezier(0.22, 0.61, 0.36, 1),
              transform 180ms cubic-bezier(0.22, 0.61, 0.36, 1),
              visibility 0s linear 180ms;
}
.menu.is-open {
  opacity: 1; visibility: visible; transform: none; pointer-events: auto;
  transition-delay: 0s, 0s, 0s;
}
/* Not in the system, which only ever opens downward; added so a menu near the bottom of the
   viewport does not open off-screen. `top` is the trigger's top edge, so shift up by our own
   height rather than guessing one. */
.menu--up { transform: translateY(calc(-100% + 4px)); }
.menu--up.is-open { transform: translateY(-100%); }

.menu__find { position: relative; padding: 2px 2px 6px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.menu__find input {
  width: 100%; height: 34px; padding: 0 10px; border: 0; background: none;
  font: inherit; font-size: 13.5px; color: var(--ink);
}
.menu__find input:focus { outline: none; }
.menu__list { max-height: 244px; overflow: auto; overscroll-behavior: contain; }

.menu__opt {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 9px 11px; border: 0; background: none; border-radius: 10px;
  text-align: left; font: inherit; font-size: 13.5px; line-height: 1.35;
  color: var(--ink-soft); cursor: pointer;
  transition: background 180ms cubic-bezier(0.22, 0.61, 0.36, 1),
              color 180ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.menu__opt:hover, .menu__opt.active { background: var(--panel-2); color: var(--ink); }
.menu__opt.on { color: var(--ink); }
.menu__opt .lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu__n { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
.menu__opt .tick {
  flex: 0 0 auto; width: 14px; height: 14px; color: var(--accent); opacity: 0;
  fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round;
}
.menu__opt.on .tick { opacity: 1; }
.menu__empty { padding: 14px 12px; margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); }

@media (max-width: 1023px) { .menu__opt { min-height: 44px; } .menu__find input { height: 44px; } }
@media (prefers-reduced-motion: reduce) { .menu, .selbtn__c { transition-duration: 0.01ms; } }
</style>
