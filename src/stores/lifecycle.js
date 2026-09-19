import { defineStore } from 'pinia'

import { api } from '../services/api'

/**
 * The five steps a contract moves through, named once.
 *
 * The API decides which step an engagement is in — it owns the statuses and the mapping — and
 * sends `stage` on every engagement it returns. What lives here is only how a step is *drawn*:
 * its order in the sidebar, the sentence under its heading, and what a person is waiting for
 * while an engagement sits in it.
 */
export const STAGES = [
  {
    key: 'NEGOTIATIONS',
    label: 'Negotiations',
    blurb: 'The deal is being agreed with the customer offline.',
    waiting: 'Nothing to do here until the agreement is signed and ready to upload.',
  },
  {
    key: 'ONBOARDING',
    label: 'Onboarding',
    blurb: 'Agreements are uploaded and read.',
    waiting: 'Upload the agreements, then check the terms we read out of them.',
  },
  {
    key: 'REVIEW',
    label: 'Review',
    blurb: 'The customer reviews the terms and signs, or asks for changes.',
    waiting: 'With the customer. They sign, or tell us what to change.',
  },
  {
    key: 'BILLING_SETUP',
    label: 'Billing Setup',
    blurb: 'Billing is being configured from the agreed terms.',
    // Automatic and quick, so anything sitting here is stuck rather than working.
    waiting: 'Generated automatically from the signed terms. Nothing here for long.',
  },
  {
    key: 'BILLING_AUDIT',
    label: 'Billing Audit',
    blurb: 'The billing breakdown is checked before the engagement goes live.',
    waiting: 'Check what makes up an invoice, then approve it to go live.',
  },
]

// Active is a destination, not a step somebody works: it gets a row on the board but no
// sidebar entry, because nobody goes looking for "what has already finished".
export const ACTIVE_STAGE = {
  key: 'ACTIVE',
  label: 'Active',
  blurb: 'Signed, billing and running.',
  waiting: 'Live. Billing is running against the agreed terms.',
}

export const ALL_STAGES = [...STAGES, ACTIVE_STAGE]
export const stageMeta = (key) => ALL_STAGES.find((s) => s.key === key) || ACTIVE_STAGE

export const useLifecycleStore = defineStore('lifecycle', {
  state: () => ({
    engagements: [],
    stages: [],
    loaded: false,
    err: '',
  }),
  getters: {
    // Counts come from the API alongside the rows, so a step showing "4" and then listing
    // three engagements is not a state this can reach.
    countFor: (s) => (key) => s.stages.find((x) => x.key === key)?.count ?? 0,
    inStage: (s) => (key) => s.engagements.filter((e) => e.stage === key),
    // What is not finished yet — the working total the dashboard leads with.
    inFlight: (s) => s.engagements.filter((e) => e.stage !== 'ACTIVE'),
  },
  actions: {
    async load() {
      try {
        const { data } = await api.get('/engagements')
        this.engagements = data.engagements || []
        this.stages = data.stages || []
        this.err = ''
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      } finally {
        this.loaded = true
      }
    },
  },
})
