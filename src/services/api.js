import axios from 'axios'

import { config } from '../config'
import { getUser } from './auth'

export const api = axios.create({ baseURL: config.apiBase })

// Attach the Cognito ID token (aud = client_id, which the API Gateway JWT authorizer checks).
api.interceptors.request.use(async (cfg) => {
  const user = await getUser()
  if (user?.id_token) cfg.headers.Authorization = `Bearer ${user.id_token}`
  return cfg
})
