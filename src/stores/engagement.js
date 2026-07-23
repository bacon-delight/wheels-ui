import { defineStore } from 'pinia'

import { api } from '../services/api'

const money = (n) =>
  n == null ? '' : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2 })}`

export const useEngagementStore = defineStore('engagement', {
  state: () => ({
    eid: null,
    data: null,
    clientTerms: [],
    busy: '', // verb of the in-flight action ('' = idle)
    err: '',
    loaded: false,
  }),
  getters: {
    submission: (s) => s.data?.submission,
    documents: (s) => s.data?.documents || [],
    members: (s) => s.data?.members || [],
    status: (s) => s.data?.submission?.status,
    isProvider: (s) => s.data?.your_role !== 'client',
    docFor: (s) => (type) => {
      const sub = s.data?.submission
      const id = type === 'MSA' ? sub?.msa_document_id : sub?.mla_document_id
      const docs = s.data?.documents || []
      return docs.find((d) => d.document_id === id) || docs.find((d) => d.doc_type === type)
    },
    reviewDocs() {
      return ['MSA', 'MLA'].map((t) => this.docFor(t)).filter(Boolean)
    },
    totalTerms() {
      return this.reviewDocs.reduce((n, d) => n + (d.review?.total || 0), 0)
    },
    approvedTerms() {
      return this.reviewDocs.reduce((n, d) => n + (d.review?.approved || 0), 0)
    },
    allApproved() {
      return this.totalTerms > 0 && this.approvedTerms === this.totalTerms
    },
    reviewable: (s) =>
      [
        'IN_UNDERWRITING', 'PENDING_CLIENT_APPROVAL', 'CLIENT_APPROVED',
        'PENDING_FINANCE_APPROVAL', 'FINANCE_APPROVED', 'BILLING_SETUP', 'ACTIVE',
      ].includes(s.data?.submission?.status),
    clientMessage: (s) => {
      const st = s.data?.submission?.status
      if (['CLIENT_APPROVED', 'PENDING_FINANCE_APPROVAL', 'FINANCE_APPROVED', 'BILLING_SETUP', 'ACTIVE'].includes(st))
        return 'You approved these terms — they are being finalized. Nothing more is needed from you.'
      if (['CHANGES_REQUESTED_CLIENT', 'REVALIDATING', 'VALIDATION_FAILED'].includes(st))
        return 'Your change request was sent. The provider is updating the agreement and will resubmit.'
      return 'Your billing terms are being prepared. They will appear here for your review shortly.'
    },
  },
  actions: {
    async load(eid) {
      this.eid = eid
      try {
        this.data = (await api.get(`/engagements/${eid}`)).data
        if (this.reviewable) await this.loadClientTerms()
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      } finally {
        this.loaded = true
      }
    },
    async loadClientTerms() {
      const out = []
      for (const type of ['MSA', 'MLA']) {
        const d = this.docFor(type)
        if (!d) continue
        try {
          const r = await api.get(
            `/engagements/${this.eid}/documents/${d.document_id}/versions/${d.current_version}/fields`,
          )
          out.push({ doc_type: type, document_id: d.document_id, version: d.current_version, fields: r.data.fields })
        } catch {
          /* ignore per-doc */
        }
      }
      this.clientTerms = out
    },
    async action(verb, body) {
      this.busy = verb
      this.err = ''
      try {
        await api.post(`/engagements/${this.eid}/submissions/${this.submission.submission_id}:${verb}`, body || {})
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      } finally {
        this.busy = ''
      }
    },
    async upload(type, file) {
      this.busy = `upload-${type}`
      this.err = ''
      try {
        const { data: p } = await api.post(`/engagements/${this.eid}/documents:presign`, {
          doc_type: type, filename: file.name, submission_id: this.submission.submission_id,
        })
        await fetch(p.upload_url, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file })
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      } finally {
        this.busy = ''
      }
    },
    async invite(email, name) {
      this.busy = 'invite'
      this.err = ''
      try {
        // Engagement invites are always client reviewers; provider staff live under Users.
        await api.post(`/engagements/${this.eid}/invitations`, { email, name: name || null })
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      } finally {
        this.busy = ''
      }
    },
  },
})

export { money }
export const prettyService = (s) => s.replace(/([a-z])([A-Z])/g, '$1 $2')
export function feeLine(fi) {
  const parts = []
  if (fi.amount != null) parts.push(money(fi.amount))
  if (fi.rate_pct != null) parts.push(`${fi.fee_type === 'cost_plus' ? 'cost + ' : ''}${fi.rate_pct}%`)
  if (fi.unit_basis) parts.push(fi.unit_basis.replace(/_/g, ' '))
  if (fi.minimum != null) parts.push(`min ${money(fi.minimum)}`)
  return parts.join(' · ')
}
