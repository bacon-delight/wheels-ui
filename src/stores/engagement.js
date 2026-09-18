import { defineStore } from 'pinia'

import { api } from '../services/api'

// One source of truth for agreement labels. Previously a binary ternary duplicated in three
// places, which silently rendered any unknown doc_type as "Vehicle Lease (MLA)".
export const DOC_LABELS = {
  MSA: 'Fleet Management Services (MSA)',
  MLA: 'Vehicle Lease (MLA)',
}
export const docLabel = (t) => DOC_LABELS[t] || t

export const SCOPE_LABELS = {
  LEASE_ONLY: 'Lease only',
  SERVICE_ONLY: 'Service only',
  LEASE_AND_SERVICE: 'Lease + service',
}
// An agreement is either the one in force or kept for the record.
export const STANDING_LABELS = { CURRENT: 'In force', SUPERSEDED: 'Superseded' }

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
      // Slot map first; the legacy scalar fields keep pre-migration submissions working.
      const id =
        sub?.document_ids?.[type] ??
        (type === 'MSA' ? sub?.msa_document_id : type === 'MLA' ? sub?.mla_document_id : null)
      const docs = s.data?.documents || []
      return docs.find((d) => d.document_id === id) || docs.find((d) => d.doc_type === type)
    },
    // Which agreements this engagement needs, from its scope. Falls back to the old pair so a
    // stale API response still renders.
    requiredDocTypes: (s) => s.data?.required_doc_types || ['MLA', 'MSA'],
    missingDocTypes: (s) => s.data?.missing_doc_types || [],
    // Required types plus anything actually uploaded, so a stray extra document still shows.
    docTypes() {
      const sub = this.data?.submission
      const present = Object.keys(sub?.document_ids || {})
      return [...new Set([...this.requiredDocTypes, ...present])]
    },
    assignedVehicleCount: (s) => s.data?.assigned_vehicle_count ?? 0,
    fleetSizeSource: (s) => s.data?.fleet_size_source || 'derived',
    customer: (s) => s.data?.customer || null,
    fleetDrift() {
      const billed = this.data?.engagement?.fleet_size ?? 0
      return billed !== this.assignedVehicleCount
    },
    // An engagement holds every agreement ever uploaded for it. Only the ones in force are
    // under negotiation; superseded ones are kept for the record.
    currentDocs: (s) => (s.data?.documents || []).filter((d) => d.standing !== 'SUPERSEDED'),
    supersededDocs: (s) => (s.data?.documents || []).filter((d) => d.standing === 'SUPERSEDED'),
    unclassifiedDocs: (s) =>
      (s.data?.documents || []).filter((d) => !d.doc_type || d.doc_type === 'UNKNOWN'),
    reviewDocs() {
      return this.currentDocs.filter((d) => d.doc_type && d.doc_type !== 'UNKNOWN')
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
      for (const type of this.docTypes) {
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
    // Uploaders no longer choose a type; the parse worker reads it off the document. Passing a
    // documentId means "this revises that agreement" rather than "this is another one".
    async uploadFiles(files, documentId = null) {
      const list = Array.from(files || [])
      if (!list.length) return
      this.busy = 'upload'
      this.err = ''
      try {
        for (const file of list) {
          const body = {
            filename: file.name,
            submission_id: this.submission.submission_id,
            ...(documentId ? { document_id: documentId } : {}),
          }
          const { data: p } = await api.post(
            `/engagements/${this.eid}/documents:presign`, body,
          )
          await fetch(p.upload_url, {
            method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file,
          })
        }
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    async setDocType(documentId, docType) {
      this.busy = `type-${documentId}`
      this.err = ''
      try {
        await api.put(`/engagements/${this.eid}/documents/${documentId}/type`, {
          doc_type: docType,
        })
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    async invite(email, name) {
      this.busy = 'invite'
      this.err = ''
      try {
        // Engagement invites are always customer reviewers; provider staff live under Users.
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

// Recurring monthly estimate from billing lines (each { fee_items }) at a given fleet size:
// per-vehicle-per-month flat fees + the applicable bundled tier band, × fleet.
const monthlyPerUnit = (fi) => fi.amount != null && /per_(vehicle|unit).*(month)/.test(fi.unit_basis || '')
export function estimateMonthly(lines, fleet) {
  let perUnit = 0
  for (const sl of lines || []) {
    for (const fi of sl.fee_items || []) {
      if (monthlyPerUnit(fi)) perUnit += fi.amount
      const band = (fi.tier_bands || []).find(
        (t) => fleet >= t.min_units && (t.max_units == null || fleet <= t.max_units),
      )
      if (band?.amount != null) perUnit += band.amount
    }
  }
  return perUnit * fleet
}
export function feeLine(fi) {
  const parts = []
  if (fi.amount != null) parts.push(money(fi.amount))
  if (fi.rate_pct != null) parts.push(`${fi.fee_type === 'cost_plus' ? 'cost + ' : ''}${fi.rate_pct}%`)
  if (fi.unit_basis) parts.push(fi.unit_basis.replace(/_/g, ' '))
  if (fi.minimum != null) parts.push(`min ${money(fi.minimum)}`)
  return parts.join(' · ')
}
