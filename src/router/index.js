import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '../stores/auth'

const routes = [
  // Landing is role-dependent: providers get the finance dashboard, clients their engagements.
  { path: '/', name: 'home', redirect: () => ({ name: 'engagements' }), meta: { auth: true } },
  {
    path: '/engagements',
    name: 'engagements',
    component: () => import('../views/EngagementsView.vue'),
    meta: { auth: true },
  },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  {
    path: '/customers',
    name: 'customers',
    component: () => import('../views/CustomersView.vue'),
    meta: { auth: true, provider: true },
  },
  {
    path: '/customers/:cid',
    name: 'customer',
    component: () => import('../views/CustomerDetailView.vue'),
    meta: { auth: true, provider: true },
  },
  {
    path: '/vehicles',
    name: 'vehicles',
    component: () => import('../views/VehiclesView.vue'),
    meta: { auth: true, provider: true },
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: () => import('../views/FinanceView.vue'),
    meta: { auth: true, provider: true },
  },
  // Keep the old path working for anyone with it bookmarked.
  { path: '/finance', redirect: { name: 'dashboard' } },
  {
    path: '/users',
    name: 'users',
    component: () => import('../views/UsersView.vue'),
    meta: { auth: true, provider: true },
  },
  {
    path: '/onboarding',
    name: 'onboarding',
    component: () => import('../views/OnboardingView.vue'),
    meta: { auth: true },
  },
  {
    path: '/engagements/:eid',
    component: () => import('../views/EngagementLayout.vue'),
    meta: { auth: true },
    children: [
      { path: '', name: 'eng-overview', component: () => import('../views/tabs/OverviewTab.vue') },
      { path: 'terms', name: 'eng-terms', component: () => import('../views/tabs/TermsTab.vue') },
      { path: 'billing', name: 'eng-billing', component: () => import('../views/tabs/BillingTab.vue') },
      { path: 'summary', name: 'eng-summary', component: () => import('../views/tabs/SummaryTab.vue') },
      { path: 'vehicles', name: 'eng-vehicles', component: () => import('../views/tabs/VehiclesTab.vue') },
      { path: 'people', name: 'eng-people', component: () => import('../views/tabs/PeopleTab.vue') },
    ],
  },
  {
    path: '/engagements/:eid/documents/:did/v/:version/review',
    name: 'review',
    component: () => import('../views/ReviewView.vue'),
    meta: { auth: true },
  },
  {
    path: '/engagements/:eid/documents/:did/v/:version/source',
    name: 'source',
    component: () => import('../views/SourceView.vue'),
    meta: { auth: true },
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()
  if (to.meta.auth && !auth.isAuthenticated) return { name: 'login', query: { next: to.fullPath } }
  if (auth.isAuthenticated) {
    if (!auth.profileChecked) await auth.fetchProfile()
    // Mandatory onboarding: no authed page until name + phone are set.
    if (auth.needsOnboarding && to.name !== 'onboarding') return { name: 'onboarding' }
    if (!auth.needsOnboarding && to.name === 'onboarding') return { name: 'home' }
    // Providers land on the dashboard; clients have no dashboard, so they get their list.
    if (to.name === 'home') return { name: auth.isProvider ? 'dashboard' : 'engagements' }
    // Provider-only pages are off-limits to clients.
    if (to.meta.provider && !auth.isProvider) return { name: 'engagements' }
  }
})

export default router
