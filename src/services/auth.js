// Cognito Hosted UI login via OIDC Authorization Code + PKCE.
import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

import { config } from '../config'

export const userManager = new UserManager({
  authority: config.cognito.authority,
  client_id: config.cognito.clientId,
  redirect_uri: config.cognito.redirectUri,
  post_logout_redirect_uri: config.cognito.postLogoutRedirectUri,
  response_type: 'code',
  scope: config.cognito.scope,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
  automaticSilentRenew: true,
})

export const login = () => userManager.signinRedirect()
export const handleCallback = () => userManager.signinRedirectCallback()
export const getUser = () => userManager.getUser()

export async function logout() {
  await userManager.removeUser()
  const { hostedDomain, clientId, postLogoutRedirectUri } = config.cognito
  // Cognito's logout uses its own endpoint/param shape.
  window.location.href =
    `${hostedDomain}/logout?client_id=${clientId}` +
    `&logout_uri=${encodeURIComponent(postLogoutRedirectUri)}`
}
