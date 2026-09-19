<script setup>
defineProps({ status: { type: String, default: '' } })
const LABELS = {
  DRAFT: 'Draft',
  EXTRACTING: 'Extracting…',
  IN_UNDERWRITING: 'In review',
  PENDING_CLIENT_APPROVAL: 'Awaiting customer',
  CHANGES_REQUESTED_CLIENT: 'Customer requested changes',
  REVALIDATING: 'Re-validating',
  VALIDATION_FAILED: 'Validation failed',
  CLIENT_APPROVED: 'Customer signed',
  BILLING_SETUP: 'Setting up billing…',
  PENDING_BILLING_AUDIT: 'Awaiting billing audit',
  CHANGES_REQUESTED_AUDIT: 'Audit requested changes',
  ACTIVE: 'Active — billing',
}
const CLASS = {
  ACTIVE: 'ok',
  CLIENT_APPROVED: 'ok',
  VALIDATION_FAILED: 'risk',
  CHANGES_REQUESTED_CLIENT: 'warn',
  CHANGES_REQUESTED_AUDIT: 'warn',
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
