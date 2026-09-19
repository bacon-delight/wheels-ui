<script setup>
import { computed, ref, watch } from 'vue'

import Dialog from '../../components/Dialog.vue'
import { useEngagementStore } from '../../stores/engagement'

const eng = useEngagementStore()
const email = ref('')
const name = ref('')
const picked = ref('')
const q = ref('')
const notice = ref('')
const showInvite = ref(false)

// Engagement People = the customer's own people. Wheels staff are managed org-wide under Users.
// `role === 'client'` is the wire value; the label people read is "Customer".
const customers = computed(() => eng.members.filter((m) => m.role === 'client'))
const customerName = computed(() => eng.data?.engagement?.client_name || 'this customer')
const chosen = computed(() => eng.candidates.find((c) => c.user_id === picked.value) || null)
// Picking someone who belongs to another customer is legitimate — the person inviting knows
// something the engagement record does not — but it is never something to do by accident.
const elsewhere = computed(() =>
  chosen.value && !chosen.value.same_customer ? chosen.value.customers[0] || '' : '',
)
const looksLikeEmail = computed(() => /^\S+@\S+\.\S+$/.test(q.value.trim()))

// Searching is the server's job — accounts exist that this engagement has never seen — so the
// query is debounced rather than filtered in place. A new query drops the selection with it:
// a pick that has scrolled out of the answer is a pick nobody can see, and the footer button
// would still act on it.
let timer
watch(q, (needle) => {
  picked.value = ''
  eng.searching = true
  clearTimeout(timer)
  timer = setTimeout(() => eng.loadCandidates(needle.trim()), 220)
})
// The two halves of the dialog are one choice, so each clears the other: picking someone
// empties the new-person fields, and typing a name or email drops the pick. Without that the
// footer button would have to guess which of the two the person meant.
watch(showInvite, (open) => {
  if (!open) return
  picked.value = ''
  q.value = ''
  email.value = ''
  name.value = ''
  eng.err = ''
  eng.loadCandidates()
})
watch([email, name], ([e, n]) => {
  if (e || n) picked.value = ''
})
function pick(c) {
  picked.value = picked.value === c.user_id ? '' : c.user_id
  if (picked.value) {
    email.value = ''
    name.value = ''
  }
}
function useTyped() {
  email.value = q.value.trim()
  picked.value = ''
}

const initial = (c) => ((c.name || c.email)[0] || '?').toUpperCase()
// Where someone is already known, in one line: their customer first when it is not this one.
function whereabouts(c) {
  if (c.source === 'account') return 'has an account, not on an engagement yet'
  const on = c.engagements.length ? `on ${c.engagements.join(', ')}` : ''
  return c.same_customer ? on : [c.customers.join(', '), on].filter(Boolean).join(' · ')
}

async function submit() {
  const who = chosen.value
  // Belt and braces: never act on a selection the list no longer shows.
  if (picked.value && !who) {
    picked.value = ''
    return
  }
  const typed = email.value
  const outcome = picked.value
    ? await eng.addMember(picked.value, q.value.trim())
    : await eng.invite(email.value, name.value)
  if (eng.err) return
  notice.value =
    outcome === 'access'
      ? `${who?.name || who?.email} now has access to this engagement.`
      : outcome === 'added'
        ? `${typed} already had an account — they now have access, with the password they already use.`
        : `Invitation sent to ${typed}.`
  email.value = ''
  name.value = ''
  picked.value = ''
  showInvite.value = false
}
</script>

<template>
  <div class="card pad">
    <div class="spread" style="align-items: flex-start">
      <div>
        <h2 style="margin: 0">Customer access</h2>
        <p class="muted small" style="margin: 6px 0 14px">
          People on the customer side who can review and approve the terms for this engagement.
        </p>
      </div>
      <button class="primary nowrap" @click="showInvite = true">＋ Invite customer</button>
    </div>

    <p v-if="notice" class="notice">
      {{ notice }}
      <button class="link" type="button" @click="notice = ''">Dismiss</button>
    </p>

    <div class="members">
      <div v-for="m in customers" :key="m.user_id" class="member">
        <div class="row" style="gap: 12px">
          <div class="ava">{{ ((m.name || m.email)[0] || '?').toUpperCase() }}</div>
          <div class="minfo">
            <div class="mname">{{ m.name || m.email }}</div>
            <div class="muted small">
              {{ m.email }}<span v-if="m.phone"> · {{ m.phone }}</span>
              <span v-if="!m.name" class="pending"> · not onboarded yet</span>
            </div>
          </div>
        </div>
        <span class="pill role">Customer</span>
      </div>
      <p v-if="!customers.length" class="muted small" style="padding: 6px 0">No customers invited yet.</p>
    </div>

    <Dialog
      :open="showInvite"
      title="Invite a customer"
      subtitle="Find someone who already has an account, or invite someone new."
      @close="showInvite = false"
    >
      <div class="finder" :class="{ 'has-value': q }">
        <svg class="finder__ico" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" />
        </svg>
        <input
          v-model="q"
          class="finder__in"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Search people by name or email"
          aria-label="Search existing accounts"
        />
        <button class="finder__x" type="button" aria-label="Clear search" @click="q = ''">
          <svg viewBox="0 0 13 13" aria-hidden="true"><path d="M2 2 11 11M11 2 2 11" /></svg>
        </button>
      </div>

      <p class="caption">
        <template v-if="eng.searching">Searching…</template>
        <template v-else-if="q">Accounts matching “{{ q.trim() }}”</template>
        <template v-else>Already at {{ customerName }}</template>
        <span v-if="eng.candTotal > eng.candidates.length" class="more">
          showing {{ eng.candidates.length }} of {{ eng.candTotal }}
        </span>
      </p>

      <!-- Rows from the last answer stay put while the next one is in flight, dimmed and
           unclickable, so the list neither flickers on every keystroke nor pretends the
           people it is showing are the answer to the query above them. -->
      <div v-if="eng.candidates.length" class="plist" :class="{ 'is-stale': eng.searching }">
        <button
          v-for="c in eng.candidates"
          :key="c.user_id"
          type="button"
          class="prow"
          :class="{ 'is-sel': picked === c.user_id }"
          :aria-pressed="picked === c.user_id"
          @click="pick(c)"
        >
          <span class="ava sm">{{ initial(c) }}</span>
          <span class="pinfo">
            <span class="pname">{{ c.name || c.email }}</span>
            <span class="muted small">
              <!-- Someone who never onboarded has no name, so the line above is already their
                   email; repeating it here would say the same thing twice. -->
              <template v-if="c.name">{{ c.email }} · </template>
              {{ whereabouts(c) }}
              <span v-if="!c.name" class="pending"> · not onboarded yet</span>
            </span>
          </span>
          <span class="tick" aria-hidden="true">✓</span>
        </button>
      </div>

      <p v-else-if="eng.searching" class="muted small empty">Searching…</p>
      <p v-else-if="q" class="muted small empty">
        No account matches “{{ q.trim() }}”.
        <button v-if="looksLikeEmail" class="link" type="button" @click="useTyped">
          Invite this address instead
        </button>
        <template v-else>Invite them as someone new below.</template>
      </p>
      <p v-else class="muted small empty">
        No one else is on {{ customerName }}’s engagements. Search for an existing account, or
        invite someone new below.
      </p>

      <p v-if="elsewhere" class="crosscust">
        This person is a contact at <strong>{{ elsewhere }}</strong>. Adding them here lets them
        see this engagement’s terms.
      </p>

      <div class="or"><span>or invite someone new</span></div>

      <label class="fld">
        <span class="label">Full name</span>
        <input v-model="name" placeholder="Jordan Lee" />
      </label>
      <label class="fld" style="margin-top: 14px">
        <span class="label">Email</span>
        <input v-model="email" type="email" placeholder="name@customer.com" @keyup.enter="submit" />
      </label>
      <p class="muted small hint">
        Someone new gets a temporary password by email. An address that already has an account is
        given access instead, keeping the password it already uses.
      </p>
      <p v-if="eng.err" class="err">{{ eng.err }}</p>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="showInvite = false">Cancel</button>
        <button class="primary" :disabled="(!email && !picked) || !!eng.busy" @click="submit">
          <template v-if="eng.busy === 'invite'">Working…</template>
          <template v-else-if="picked">Give access</template>
          <template v-else>Send invitation</template>
        </button>
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.small { font-size: 12px; }
.members { display: grid; gap: 4px; }
.member { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.member:last-child { border-bottom: none; }
.ava { width: 34px; height: 34px; border-radius: 9px; background: var(--accent-weak); color: var(--accent-ink); display: grid; place-items: center; font-weight: 700; font-size: 12px; flex-shrink: 0; }
.ava.sm { width: 28px; height: 28px; border-radius: 8px; font-size: 11px; }
.mname { font-weight: 600; }
.pending { color: var(--warn); }
.pill.role { background: #e9eef6; color: var(--muted); }
.nowrap { white-space: nowrap; }
.fld { display: flex; flex-direction: column; gap: 6px; }
.err { color: var(--risk); font-size: 13px; margin: 10px 0 0; }
.hint { margin: 12px 0 0; }
.notice {
  display: flex; align-items: center; gap: 10px; margin: 0 0 14px;
  padding: 9px 13px; border-radius: 10px; background: var(--accent-weak);
  color: var(--accent-ink); font-size: 12.5px;
}
.link { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--accent-ink); cursor: pointer; }
.link:hover { text-decoration: underline; }
.notice .link { margin-left: auto; }

/* Ecosphere's compact toolbar search, here as the dialog's first control. */
.finder {
  display: flex; align-items: center; height: 36px; padding: 0 5px 0 0;
  border: 1px solid var(--line-strong); border-radius: 999px; background: var(--panel);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}
.finder:hover { border-color: var(--muted); }
.finder:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-weak); }
.finder__ico {
  flex: 0 0 auto; width: 15px; height: 15px; margin: 0 8px 0 12px; color: var(--muted);
  fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round;
}
.finder:focus-within .finder__ico { color: var(--accent); }
/* The global input style gives every field its own border, padding and focus ring. Inside the
   pill that reads as a second box drawn within the first, so the field keeps none of them and
   the pill is the only thing that lights up. */
.finder__in { flex: 1; min-width: 0; height: 100%; padding: 0; border: 0; border-radius: 0; background: none; font: inherit; font-size: 12.5px; color: var(--ink); }
.finder__in::placeholder { color: var(--muted); }
.finder__in:focus { outline: none; border: 0; box-shadow: none; }
.finder__in::-webkit-search-cancel-button, .finder__in::-webkit-search-decoration { -webkit-appearance: none; display: none; }
.finder__x { display: none; place-items: center; flex: 0 0 auto; width: 24px; height: 24px; border: 0; border-radius: 999px; background: none; color: var(--muted); cursor: pointer; }
.finder.has-value .finder__x { display: grid; }
.finder__x:hover { color: var(--ink); background: var(--bg); }
.finder__x svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; }

.caption { display: flex; align-items: baseline; gap: 8px; margin: 14px 0 6px; font-size: 10.5px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase; color: var(--muted); }
.caption .more { margin-left: auto; font-weight: 500; letter-spacing: 0.03em; text-transform: none; font-size: 11px; }
.plist { display: grid; gap: 2px; max-height: 214px; overflow-y: auto; transition: opacity 0.12s ease; }
.plist.is-stale { opacity: 0.4; pointer-events: none; }
.empty { margin: 0; padding: 4px 2px 2px; line-height: 1.55; }
/* A row is the control, not a label beside one: the whole line is the hit target, and the
   tick on the right is what says which one is chosen. */
.prow {
  display: flex; align-items: center; gap: 11px; width: 100%; text-align: left;
  padding: 8px 10px; border: 1px solid transparent; border-radius: 10px;
  background: none; font: inherit; color: inherit;
}
.prow:hover { background: var(--panel-2); }
.prow.is-sel { background: var(--accent-weak); border-color: var(--accent); }
.pinfo { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.pname { font-weight: 600; }
.pinfo .small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tick { color: var(--accent); font-weight: 700; opacity: 0; flex-shrink: 0; }
.prow.is-sel .tick { opacity: 1; }
.crosscust {
  margin: 12px 0 0; padding: 9px 12px; border-radius: 10px;
  background: #fdf3e0; color: var(--ink); font-size: 12.5px; line-height: 1.5;
}
/* A ruled "or" rather than a heading: the two halves are alternatives of equal standing. */
.or { display: flex; align-items: center; gap: 12px; margin: 16px 0 14px; color: var(--muted); font-size: 12px; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
</style>
