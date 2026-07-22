import { defineStore } from 'pinia'

import { getSession, signOut } from '../services/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({ claims: null, ready: false }),
  getters: {
    isAuthenticated: (s) => !!s.claims,
    email: (s) => s.claims?.email || '',
    name: (s) => s.claims?.name || s.claims?.email || '',
    groups: (s) => {
      const g = s.claims?.['cognito:groups']
      return Array.isArray(g) ? g : g ? [g] : []
    },
    isProvider() {
      return this.groups.includes('provider') || this.groups.includes('finance')
    },
    role() {
      return this.isProvider ? 'provider' : 'client'
    },
  },
  actions: {
    async init() {
      const session = await getSession()
      this.claims = session ? session.getIdToken().payload : null
      this.ready = true
    },
    setSession(session) {
      this.claims = session.getIdToken().payload
      this.ready = true
    },
    logout() {
      signOut()
      this.claims = null
      window.location.href = '/login'
    },
  },
})
