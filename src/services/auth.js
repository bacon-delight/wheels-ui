// Native, in-app Cognito login (SRP) — no hosted-UI redirect.
import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
} from 'amazon-cognito-identity-js'

import { config } from '../config'

const pool = new CognitoUserPool({
  UserPoolId: config.cognito.userPoolId,
  ClientId: config.cognito.clientId,
})

// Resolve to a valid session (auto-refreshes with the stored refresh token) or null.
export function getSession() {
  return new Promise((resolve) => {
    const user = pool.getCurrentUser()
    if (!user) return resolve(null)
    user.getSession((err, session) => {
      resolve(err || !session?.isValid() ? null : session)
    })
  })
}

export async function getIdToken() {
  const session = await getSession()
  return session ? session.getIdToken().getJwtToken() : null
}

// Returns { session } on success, or { newPasswordRequired, user } for first-login users.
export function signIn(email, password) {
  return new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: pool })
    const details = new AuthenticationDetails({ Username: email, Password: password })
    user.authenticateUser(details, {
      onSuccess: (session) => resolve({ session }),
      onFailure: (err) => reject(err),
      newPasswordRequired: () => resolve({ newPasswordRequired: true, user }),
    })
  })
}

export function completeNewPassword(user, newPassword) {
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(
      newPassword,
      {},
      { onSuccess: (session) => resolve(session), onFailure: (err) => reject(err) },
    )
  })
}

export function signOut() {
  pool.getCurrentUser()?.signOut()
}
