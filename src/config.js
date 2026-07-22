// Build-time config (VITE_* overrides baked at build; sensible dev defaults otherwise).
const origin = window.location.origin

export const config = {
  apiBase: import.meta.env.VITE_API_BASE || 'https://api-wheels.logiforma.dev',
  cognito: {
    authority:
      import.meta.env.VITE_COGNITO_AUTHORITY ||
      'https://cognito-idp.ap-south-2.amazonaws.com/ap-south-2_5IstyERCM',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '1qs6q6ik01ge6c4mo6lpflhakr',
    hostedDomain:
      import.meta.env.VITE_COGNITO_DOMAIN ||
      'https://wheels-dev-432417416277.auth.ap-south-2.amazoncognito.com',
    redirectUri: origin + '/callback',
    postLogoutRedirectUri: origin + '/',
    scope: 'openid email profile',
  },
}
