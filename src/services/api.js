import axios from 'axios'

import { config } from '../config'
import { getIdToken } from './auth'

export const api = axios.create({ baseURL: config.apiBase })

// Attach the Cognito ID token (aud = client_id, which the API Gateway JWT authorizer checks).
api.interceptors.request.use(async (cfg) => {
  const token = await getIdToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})
