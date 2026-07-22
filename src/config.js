// Build-time config (VITE_* overrides baked at build; sensible dev defaults otherwise).
export const config = {
  apiBase: import.meta.env.VITE_API_BASE || 'https://api-wheels.logiforma.dev',
  cognito: {
    userPoolId: import.meta.env.VITE_COGNITO_POOL_ID || 'ap-south-2_5IstyERCM',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '1qs6q6ik01ge6c4mo6lpflhakr',
    region: import.meta.env.VITE_COGNITO_REGION || 'ap-south-2',
  },
}
