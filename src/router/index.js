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
  { path: '/callback', name: 'callback', component: () => import('../views/CallbackView.vue') },
  {
    path: '/engagements/:eid',
    name: 'engagement',
    component: () => import('../views/EngagementDetailView.vue'),
    meta: { auth: true },
  },
  {
    path: '/engagements/:eid/documents/:did/v/:version/review',
    name: 'review',
    component: () => import('../views/ReviewView.vue'),
    meta: { auth: true },
  },
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.init()
  if (to.meta.auth && !auth.isAuthenticated) return { name: 'login', query: { next: to.fullPath } }
})

export default router
