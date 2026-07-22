<script setup>
import { ref } from 'vue'

import { useEngagementStore } from '../../stores/engagement'

const eng = useEngagementStore()
const email = ref('')
const role = ref('client')

async function invite() {
  await eng.invite(email.value, role.value)
  email.value = ''
}
</script>

<template>
  <div class="card pad">
    <h2>People</h2>
    <div class="members">
      <div v-for="m in eng.members" :key="m.user_id" class="member">
        <div class="row" style="gap: 10px">
          <div class="ava">{{ (m.email[0] || '?').toUpperCase() }}</div>
          <span>{{ m.email }}</span>
        </div>
        <span class="pill role">{{ m.role }}</span>
      </div>
    </div>

    <div class="invite">
      <div class="label" style="margin-bottom: 8px">Invite someone</div>
      <div class="row">
        <input v-model="email" type="email" placeholder="name@company.com" />
        <select v-model="role" style="width: 150px">
          <option value="client">Client</option>
          <option value="provider">Provider</option>
        </select>
        <button class="primary" :disabled="!email || !!eng.busy" @click="invite">
          {{ eng.busy === 'invite' ? 'Inviting…' : 'Invite' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pad { padding: 20px 22px; }
.members { display: grid; gap: 4px; }
.member { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }
.ava { width: 30px; height: 30px; border-radius: 9px; background: var(--accent-weak); color: var(--accent-ink); display: grid; place-items: center; font-weight: 700; font-size: 12px; }
.pill.role { background: #efece6; color: var(--muted); text-transform: capitalize; }
.invite { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); }
</style>
