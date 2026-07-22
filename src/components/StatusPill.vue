<script setup>
defineProps({ status: { type: String, default: '' } })
const LABELS = {
  DRAFT: 'Draft',
  EXTRACTING: 'Extracting…',
  IN_UNDERWRITING: 'In review',
  PENDING_CLIENT_APPROVAL: 'Awaiting client',
  CHANGES_REQUESTED_CLIENT: 'Client requested changes',
  REVALIDATING: 'Re-validating',
  VALIDATION_FAILED: 'Validation failed',
  CLIENT_APPROVED: 'Client approved',
  PENDING_FINANCE_APPROVAL: 'Awaiting finance',
  CHANGES_REQUESTED_FINANCE: 'Finance requested changes',
  FINANCE_APPROVED: 'Finance approved',
  BILLING_SETUP: 'Setting up billing…',
  ACTIVE: 'Active — billing configured',
}
const CLASS = {
  ACTIVE: 'ok',
  CLIENT_APPROVED: 'ok',
  FINANCE_APPROVED: 'ok',
  VALIDATION_FAILED: 'risk',
  CHANGES_REQUESTED_CLIENT: 'warn',
  CHANGES_REQUESTED_FINANCE: 'warn',
}
</script>

<template>
  <span class="pill s" :class="CLASS[status] || 'info'">{{ LABELS[status] || status }}</span>
</template>

<style scoped>
.pill.s { font-size: 12px; }
.pill.info { background: var(--accent-weak); color: var(--accent); }
.pill.ok { background: var(--ok-weak); color: var(--ok); }
.pill.warn { background: var(--warn-weak); color: var(--warn); }
.pill.risk { background: var(--risk-weak); color: var(--risk); }
</style>
