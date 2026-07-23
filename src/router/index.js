import { createRouter, createWebHistory } from 'vue-router'

import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/',
    name: 'engagements',
    component: () => import('../views/EngagementsView.vue'),
    meta: { auth: true },
  },
  { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
  {
    path: '/finance',
    name: 'finance',
    component: () => import('../views/FinanceView.vue'),
    meta: { auth: true, provider: true },
  },
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
      { path: 'status', name: 'eng-status', component: () => import('../views/tabs/StatusTab.vue') },
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
    if (!auth.needsOnboarding && to.name === 'onboarding') return { path: '/' }
    // Provider-only pages (Finance, Users) are off-limits to clients.
    if (to.meta.provider && !auth.isProvider) return { path: '/' }
  }
})

export default router
