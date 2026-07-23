<script setup>
import { computed, ref } from 'vue'

import { useEngagementStore } from '../../stores/engagement'

const eng = useEngagementStore()
const email = ref('')
const name = ref('')

// Engagement People = the client reviewers. Wheels staff are managed org-wide under Users.
const clients = computed(() => eng.members.filter((m) => m.role === 'client'))

async function invite() {
  await eng.invite(email.value, name.value)
  email.value = ''
  name.value = ''
}
</script>

<template>
  <div class="card pad">
    <h2>Client access</h2>
    <p class="muted small" style="margin: -6px 0 14px">
      People on the client side who can review and approve the terms for this engagement.
    </p>
    <div class="members">
      <div v-for="m in clients" :key="m.user_id" class="member">
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
        <span class="pill role">Client</span>
      </div>
      <p v-if="!clients.length" class="muted small" style="padding: 6px 0">No client reviewers invited yet.</p>
    </div>

    <div class="invite">
      <div class="label" style="margin-bottom: 8px">Invite a client reviewer</div>
      <div class="row">
        <input v-model="name" placeholder="Full name (optional)" style="max-width: 200px" />
        <input v-model="email" type="email" placeholder="name@client.com" />
        <button class="primary" :disabled="!email || !!eng.busy" @click="invite">
          {{ eng.busy === 'invite' ? 'Inviting…' : 'Invite' }}
        </button>
      </div>
      <p v-if="eng.err" class="err">{{ eng.err }}</p>
    </div>
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
.pill.role { background: #efece6; color: var(--muted); }
.invite { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
.err { color: var(--risk); font-size: 13px; margin: 10px 0 0; }
</style>
