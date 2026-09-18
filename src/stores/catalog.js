import { defineStore } from 'pinia'

import { api } from '../services/api'

// The catalog is small and changes rarely, but three separate surfaces need it: the services
// page, the engagement coverage tab, and the dropdown that lets an analyst attach a term to a
// service from inside the review screen. Loading it once here keeps those in agreement.
export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    programs: [],
    totals: { programs: 0, items: 0, in_use: 0, unmatched: 0 },
    categories: [],
    unmatched: [],
    loaded: false,
    busy: '',
    err: '',
  }),
  getters: {
    byId: (s) => Object.fromEntries(s.programs.map((p) => [p.program_id, p])),
    // For the "link this term to a service" picker.
    options: (s) =>
      s.programs.map((p) => ({ value: p.program_id, label: p.name, hint: p.category || '' })),
  },
  actions: {
    async load(force = false) {
      if (this.loaded && !force) return
      this.err = ''
      try {
        const { data } = await api.get('/services')
        this.programs = data.programs
        this.totals = data.totals
        this.categories = data.categories
        this.loaded = true
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
    },
    async loadUnmatched() {
      try {
        this.unmatched = (await api.get('/services/unmatched')).data.unmatched
      } catch {
        this.unmatched = []
      }
    },
    async create(payload) {
      this.busy = 'create'
      this.err = ''
      try {
        await api.post('/services', payload)
        await this.load(true)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    async addItem(programId, payload) {
      this.busy = `item-${programId}`
      this.err = ''
      try {
        await api.post(`/services/${programId}/items`, payload)
        await this.load(true)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    // Teaching the catalog another name for a service it knows, and promoting one it does not,
    // are the two moves that keep coverage meaningful as new contracts arrive.
    async linkUnmatched(normalised, programId) {
      this.busy = `link-${normalised}`
      this.err = ''
      try {
        await api.post(`/services/unmatched/${encodeURIComponent(normalised)}:link`, {
          program_id: programId,
        })
        await Promise.all([this.load(true), this.loadUnmatched()])
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    async promoteUnmatched(normalised, payload) {
      this.busy = `promote-${normalised}`
      this.err = ''
      try {
        await api.post(`/services/unmatched/${encodeURIComponent(normalised)}:promote`, payload)
        await Promise.all([this.load(true), this.loadUnmatched()])
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
  },
})
