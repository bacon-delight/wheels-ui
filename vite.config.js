import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Screenshotting the app against real data needs a signed-in session, which a headless browser
// cannot obtain. The way that was done — overwriting src/services/auth.js with a stub and
// restoring it afterwards — put the real Cognito client one forgotten `git checkout` away from
// being lost, and twice left a stub in the working tree where it broke the dev server with a
// CORS error that looked like a server fault.
//
// So the substitution is an alias, switched on only by an environment variable. The real file
// is never edited, a build without the variable cannot pick the stub up, and the stub itself
// lives outside the repo.
const authStub = process.env.VITE_AUTH_STUB

export default defineConfig({
  plugins: [vue()],
  // amazon-cognito-identity-js references `global`; map it to the browser globalThis.
  define: { global: 'globalThis' },
  resolve: {
    // Matched on the import specifier every caller writes ('../services/auth'), not on a
    // resolved absolute path — an absolute key never matches a relative import.
    alias: authStub ? [{ find: /^.*\/services\/auth$/, replacement: authStub }] : [],
  },
  server: { port: 5173 },
})
