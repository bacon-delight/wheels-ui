import { defineStore } from 'pinia'

import { api } from '../services/api'
import { getSession, signOut } from '../services/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({ claims: null, ready: false, profile: null, profileChecked: false }),
  getters: {
    isAuthenticated: (s) => !!s.claims,
    email: (s) => s.claims?.email || '',
    needsOnboarding: (s) => !!s.profile?.needs_onboarding,
    name: (s) => s.profile?.name || s.claims?.name || s.claims?.email || '',
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
    async fetchProfile() {
      if (!this.claims) return
      try {
        this.profile = (await api.get('/me')).data
      } catch {
        this.profile = null
      }
      this.profileChecked = true
    },
    markOnboarded(p) {
      this.profile = { ...(this.profile || {}), ...p, needs_onboarding: false }
    },
    logout() {
      signOut()
      this.claims = null
      window.location.href = '/login'
    },
  },
})
