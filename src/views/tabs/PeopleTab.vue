<script setup>
import { computed, ref, watch } from 'vue'

import Dialog from '../../components/Dialog.vue'
import { useEngagementStore } from '../../stores/engagement'

const eng = useEngagementStore()
const email = ref('')
const name = ref('')
const picked = ref('')
const q = ref('')
const showInvite = ref(false)

// Engagement People = the customer's own people. Wheels staff are managed org-wide under Users.
// `role === 'client'` is the wire value; the label people read is "Customer".
const customers = computed(() => eng.members.filter((m) => m.role === 'client'))
const customerName = computed(() => eng.data?.engagement?.client_name || 'this customer')

const matches = computed(() => {
  const needle = q.value.trim().toLowerCase()
  if (!needle) return eng.candidates
  return eng.candidates.filter((c) =>
    `${c.name || ''} ${c.email}`.toLowerCase().includes(needle),
  )
})

// The two halves of the dialog are one choice, so each clears the other: picking a person
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

const initial = (c) => ((c.name || c.email)[0] || '?').toUpperCase()

async function submit() {
  if (picked.value) await eng.addMember(picked.value)
  else await eng.invite(email.value, name.value)
  if (!eng.err) {
    email.value = ''
    name.value = ''
    picked.value = ''
    showInvite.value = false
  }
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
      subtitle="They can review and approve the terms for this engagement."
      @close="showInvite = false"
    >
      <section v-if="eng.candidates.length" class="pick">
        <div class="secline">
          <span class="label">Already at {{ customerName }}</span>
          <input
            v-if="eng.candidates.length > 4"
            v-model="q"
            class="find"
            type="search"
            placeholder="Search people"
          />
        </div>
        <div class="plist">
          <button
            v-for="c in matches"
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
                on {{ c.engagements.join(', ') }}
                <span v-if="!c.name" class="pending"> · not onboarded yet</span>
              </span>
            </span>
            <span class="tick" aria-hidden="true">✓</span>
          </button>
          <p v-if="!matches.length" class="muted small" style="padding: 8px 2px">
            No one here matches “{{ q }}”.
          </p>
        </div>
        <div class="or"><span>or invite someone new</span></div>
      </section>

      <label class="fld">
        <span class="label">Full name</span>
        <input v-model="name" placeholder="Jordan Lee" />
      </label>
      <label class="fld" style="margin-top: 14px">
        <span class="label">Email</span>
        <input v-model="email" type="email" placeholder="name@customer.com" @keyup.enter="submit" />
      </label>
      <p class="muted small hint">
        Someone new gets a temporary password by email. Someone picked above keeps the password
        they already sign in with.
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

.secline { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.find { height: 30px; font-size: 12.5px; padding: 0 10px; width: 160px; }
.plist { display: grid; gap: 2px; max-height: 232px; overflow-y: auto; }
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
/* A ruled "or" rather than a heading: the two halves are alternatives of equal standing. */
.or { display: flex; align-items: center; gap: 12px; margin: 16px 0 14px; color: var(--muted); font-size: 12px; }
.or::before, .or::after { content: ''; flex: 1; height: 1px; background: var(--line); }
</style>
