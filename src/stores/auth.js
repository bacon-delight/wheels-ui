import { defineStore } from 'pinia'

import { getUser, login, logout } from '../services/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null, ready: false }),
  getters: {
    isAuthenticated: (s) => !!s.user && !s.user.expired,
    profile: (s) => s.user?.profile || {},
    email: (s) => s.user?.profile?.email || '',
    name: (s) => s.user?.profile?.name || s.user?.profile?.email || '',
    groups: (s) => {
      const g = s.user?.profile?.['cognito:groups']
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
      this.user = await getUser()
      this.ready = true
    },
    setUser(u) {
      this.user = u
    },
    login: () => login(),
    logout: () => logout(),
  },
})
