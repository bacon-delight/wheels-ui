<script setup>
import { computed, ref } from 'vue'

import Dialog from '../../components/Dialog.vue'
import { useEngagementStore } from '../../stores/engagement'

const eng = useEngagementStore()
const email = ref('')
const name = ref('')
const showInvite = ref(false)

// Engagement People = the customer reviewers. Wheels staff are managed org-wide under Users.
// `role === 'client'` is the wire value; the label people read is "Customer".
const customers = computed(() => eng.members.filter((m) => m.role === 'client'))

async function invite() {
  await eng.invite(email.value, name.value)
  if (!eng.err) {
    email.value = ''
    name.value = ''
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
      <button class="primary nowrap" @click="showInvite = true">＋ Invite reviewer</button>
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
      <p v-if="!customers.length" class="muted small" style="padding: 6px 0">No customer reviewers invited yet.</p>
    </div>

    <Dialog
      :open="showInvite"
      title="Invite a customer reviewer"
      subtitle="They get a temporary password by email and can review and approve the terms for this engagement."
      @close="showInvite = false"
    >
      <label class="fld">
        <span class="label">Full name</span>
        <input v-model="name" placeholder="Jordan Lee" />
      </label>
      <label class="fld" style="margin-top: 14px">
        <span class="label">Email</span>
        <input v-model="email" type="email" placeholder="name@customer.com" @keyup.enter="invite" />
      </label>
      <p v-if="eng.err" class="err">{{ eng.err }}</p>
      <template #footer>
        <span class="sp" />
        <button class="ghost" @click="showInvite = false">Cancel</button>
        <button class="primary" :disabled="!email || !!eng.busy" @click="invite">
          {{ eng.busy === 'invite' ? 'Inviting…' : 'Send invitation' }}
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
.mname { font-weight: 600; }
.pending { color: var(--warn); }
.pill.role { background: #e9eef6; color: var(--muted); }
.nowrap { white-space: nowrap; }
.fld { display: flex; flex-direction: column; gap: 6px; }
.err { color: var(--risk); font-size: 13px; margin: 10px 0 0; }
</style>
