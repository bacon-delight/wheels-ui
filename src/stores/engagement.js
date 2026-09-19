import { defineStore } from 'pinia'

import { api } from '../services/api'

// One source of truth for agreement labels. Previously a binary ternary duplicated in three
// places, which silently rendered any unknown doc_type as "Vehicle Lease (MLA)".
export const DOC_LABELS = {
  MSA: 'Fleet Management Services (MSA)',
  MLA: 'Vehicle Lease (MLA)',
}
export const docLabel = (t) => DOC_LABELS[t] || t

// The four categories a contract is read through, and the nine record types beneath them.
export const CATEGORIES = [
  { key: 'pricing', label: 'Pricing' },
  { key: 'sla', label: 'SLA' },
  { key: 'reporting', label: 'Reporting' },
  { key: 'misc', label: 'Misc' },
]
export const INFO_TYPE_LABELS = {
  pricing_item: 'Pricing item',
  sla_item: 'Service level',
  reporting_requirement: 'Report',
  definition: 'Definition',
  online_tool: 'Online tool',
  responsibility: 'Responsibility',
  signature: 'Signature',
  information_section: 'Information',
  uncategorised: 'Other section',
}
export const infoTypeLabel = (t) => INFO_TYPE_LABELS[t] || t

// How a term's own fields are shown and edited. One spec per record type replaces a form that
// only ever knew how to render a fee.
export const FIELD_SPECS = {
  pricing_item: [
    ['program', 'Program'],
    ['item', 'Item'],
    ['sub_category', 'Applies to'],
    ['frequency', 'Frequency'],
    ['amount', 'Amount', 'money'],
    ['calculation', 'Calculation', 'long'],
  ],
  sla_item: [
    ['category', 'Category'],
    ['service_level_standard', 'Standard', 'long'],
    ['frequency', 'Measured'],
    ['minimum_threshold', 'Minimum threshold'],
    ['calculation', 'Calculation', 'long'],
    ['example', 'Example', 'long'],
  ],
  reporting_requirement: [
    ['report_name', 'Report'],
    ['report_specifications', 'Contents', 'long'],
    ['frequency', 'Frequency'],
  ],
  definition: [['term', 'Term'], ['definition', 'Definition', 'long']],
  online_tool: [['tool_name', 'Tool'], ['platform', 'Platform'], ['description', 'Description', 'long']],
  responsibility: [
    ['task', 'Task', 'long'],
    ['responsible_party', 'Owed by'],
    ['topic', 'Topic'],
    ['timing', 'Timing'],
    ['frequency', 'Frequency'],
  ],
  signature: [['company', 'Company'], ['name', 'Name'], ['title', 'Title'], ['signed_date_raw', 'Signed']],
  information_section: [['topic', 'Topic'], ['description', 'Description', 'long']],
  uncategorised: [['item', 'Section'], ['detail', 'Detail', 'long']],
}

// How confidently a term was attached to a catalog service. The last two are what an analyst
// is being asked to settle.
export const MATCH_LABELS = {
  exact: 'Matched',
  alias: 'Matched',
  normalised: 'Matched',
  fuzzy: 'Close match',
  unmatched: 'Not in catalog',
}

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
    // Who could be given access: this customer's own contacts with no query, anyone with an
    // account when there is one. Fetched when the invite dialog opens rather than with the
    // engagement, since nothing else on the page needs them.
    candidates: [],
    candTotal: 0,
    uploadStatus: '', // what the upload is doing right now, named file by file

    searching: false,
    candSeq: 0,
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
    // --- review cycles -------------------------------------------------------------------
    // An engagement holds the cycle it started on plus one per amendment since. `submission`
    // is the cycle in play; `liveSubmissionId` is the one billing today, which during an
    // amendment is the earlier one.
    cycles: (s) => s.data?.cycles || [],
    liveSubmissionId: (s) => s.data?.live_submission_id || null,
    isAmendment: (s) => !!s.data?.is_amendment,
    cycleLabel: (s) => s.data?.cycle_label || 'Original agreement',
    canOpenAmendment: (s) => !!s.data?.can_open_amendment,
    // The engagement is billing on agreed terms while this amendment is reviewed.
    liveDuringAmendment() {
      return this.isAmendment && !!this.liveSubmissionId
    },
    // Agreements uploaded into the cycle now under review, as opposed to ones carried over.
    thisCycleDocs() {
      const cycle = this.submission?.cycle || 1
      return this.documents.filter((d) => (d.cycle || 1) === cycle)
    },
    // An amendment opened by mistake can be closed, but only while nothing has gone into it.
    canDiscardAmendment() {
      return (
        this.isProvider && this.isAmendment && this.status === 'DRAFT' &&
        this.thisCycleDocs.length === 0
      )
    },
    // The agreements the live cycle settled on — the ones actually billing today. An
    // amendment displaces one of them the moment its replacement is classified, so standing
    // alone cannot tell "superseded by this amendment" from "superseded long ago".
    liveDocIds() {
      const live = this.cycles.find((c) => c.submission_id === this.liveSubmissionId)
      return new Set(Object.values(live?.document_ids || {}))
    },
    // When a document may join the cycle in play. Mirrors the API's own rule: mid-review the
    // terms are with the customer or finance, and once a cycle completes a new agreement
    // belongs to an amendment.
    canUpload: (s) =>
      s.data?.your_role !== 'client' &&
      ['DRAFT', 'IN_UNDERWRITING', 'VALIDATION_FAILED', 'CHANGES_REQUESTED_CLIENT',
        'CHANGES_REQUESTED_FINANCE'].includes(s.data?.submission?.status),
    // Extracted terms, grouped the way the interface reads them.
    termCounts: (s) => s.data?.term_counts || {},
    coverage: (s) => s.data?.coverage_summary || null,
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
    // Agreements nothing has read at their current version — the only ones extraction touches.
    pendingDocs: (s) =>
      (s.data?.documents || []).filter(
        (d) => d.standing !== 'SUPERSEDED' && d.needs_extraction,
      ),
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
    clientMessage() {
      const st = this.data?.submission?.status
      if (['CLIENT_APPROVED', 'PENDING_FINANCE_APPROVAL', 'FINANCE_APPROVED', 'BILLING_SETUP', 'ACTIVE'].includes(st))
        return 'You approved these terms — they are being finalized. Nothing more is needed from you.'
      if (['CHANGES_REQUESTED_CLIENT', 'REVALIDATING', 'VALIDATION_FAILED'].includes(st))
        return 'Your change request was sent. The provider is updating the agreement and will resubmit.'
      // An amendment is a change to an agreement the customer already has, so saying their
      // terms are "being prepared" would suggest they have none.
      if (this.liveDuringAmendment)
        return 'An amendment to your agreement is being prepared. Your current terms are unchanged until you have reviewed and approved it.'
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
      // One request per agreement, returning every category with its counts, rather than one
      // request per service line.
      const out = []
      for (const d of this.currentDocs) {
        try {
          const r = await api.get(
            `/engagements/${this.eid}/documents/${d.document_id}/versions/${d.current_version}/terms`,
          )
          out.push({
            doc_type: d.doc_type,
            document_id: d.document_id,
            version: d.current_version,
            filename: d.filename,
            terms: r.data.terms,
            counts: r.data.counts_by_category,
            needsReview: r.data.needs_review_count,
            approved: r.data.approved_count,
            total: r.data.total,
          })
        } catch {
          /* one unreadable agreement must not blank the others */
        }
      }
      this.clientTerms = out
    },
    termsIn(category) {
      return this.clientTerms.flatMap((g) =>
        (g.terms || [])
          .filter((t) => t.category === category)
          .map((t) => ({ ...t, doc_type: g.doc_type, filename: g.filename })),
      )
    },
    async approveCategory(documentId, version, category) {
      this.busy = `approve-${category}`
      this.err = ''
      try {
        await api.post(
          `/engagements/${this.eid}/documents/${documentId}/versions/${version}/terms:approve`,
          {},
          { params: category ? { category } : {} },
        )
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
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
        for (const [i, file] of list.entries()) {
          // Named, numbered and staged, because a multi-megabyte PUT is the longest wait in
          // the app and a single motionless word for all of it reads as a hung screen.
          const of = list.length > 1 ? ` (${i + 1} of ${list.length})` : ''
          this.uploadStatus = `Uploading ${file.name}${of}…`
          const body = {
            filename: file.name,
            submission_id: this.submission.submission_id,
            ...(documentId ? { document_id: documentId } : {}),
          }
          const { data: p } = await api.post(
            `/engagements/${this.eid}/documents:presign`, body,
          )
          try {
            const put = await fetch(p.upload_url, {
              method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file,
            })
            // A presigned PUT that fails answers with a plain status rather than throwing, so
            // an unchecked upload left the row pointing at a key holding nothing.
            if (!put.ok) throw new Error(`the storage service refused it (${put.status})`)
          } catch (put) {
            // The document row is written when the upload is presigned, since the key is built
            // from it. If the file never arrives, take the row back — otherwise the engagement
            // holds an agreement that can never be read and sits on "reading…" for ever.
            await api
              .delete(`/engagements/${this.eid}/documents/${p.document_id}/versions/${p.version}`)
              .catch(() => {})
            throw new Error(`${file.name} was not uploaded — ${put.message}. Nothing was kept.`)
          }
        }
        this.uploadStatus = 'Reading the file…'
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.uploadStatus = ''
      this.busy = ''
    },
    // A renewal, an added lease or service, or a reissued document all change the terms, so
    // they go through their own review cycle rather than editing a signed one.
    async openAmendment() {
      this.busy = 'amend'
      this.err = ''
      try {
        await api.post(`/engagements/${this.eid}/amendments`)
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    async discardAmendment() {
      this.busy = 'discard'
      this.err = ''
      try {
        await api.delete(`/engagements/${this.eid}/amendments/${this.submission.submission_id}`)
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    // Extraction is per document: only a new or replaced agreement needs reading.
    async extractDocument(documentId) {
      this.busy = `extract-${documentId}`
      this.err = ''
      try {
        await api.post(`/engagements/${this.eid}/documents/${documentId}:extract`)
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      }
      this.busy = ''
    },
    async removeDocument(documentId) {
      this.busy = `remove-${documentId}`
      this.err = ''
      try {
        await api.delete(`/engagements/${this.eid}/documents/${documentId}`)
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
      let outcome = ''
      try {
        // Engagement invites are always customer-side; provider staff live under Users. The
        // server answers which of the two happened: a new account, or access for one that
        // already existed.
        const { data } = await api.post(`/engagements/${this.eid}/invitations`, {
          email,
          name: name || null,
        })
        outcome = data.outcome || 'invited'
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      } finally {
        this.busy = ''
      }
      return outcome
    },
    async loadCandidates(q = '') {
      // Each keystroke's answer can arrive out of order; only the newest may write.
      const seq = ++this.candSeq
      this.searching = true
      try {
        const { data } = await api.get(`/engagements/${this.eid}/invitations/candidates`, {
          params: q ? { q } : {},
        })
        if (seq !== this.candSeq) return
        this.candidates = data.candidates || []
        this.candTotal = data.total ?? this.candidates.length
      } catch {
        // The picker is an accelerator, never the only way in — a failure here leaves the
        // invite-by-email path working rather than blocking the dialog with an error.
        if (seq === this.candSeq) {
          this.candidates = []
          this.candTotal = 0
        }
      } finally {
        if (seq === this.candSeq) this.searching = false
      }
    },
    async addMember(userId) {
      this.busy = 'invite'
      this.err = ''
      try {
        await api.post(`/engagements/${this.eid}/members`, { user_id: userId })
        // No candidate refetch: the dialog closes on success, and the next open asks again.
        await this.load(this.eid)
      } catch (e) {
        this.err = e.response?.data?.detail || e.message
      } finally {
        this.busy = ''
      }
      return this.err ? '' : 'access'
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
