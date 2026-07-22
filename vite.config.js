import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  // amazon-cognito-identity-js references `global`; map it to the browser globalThis.
  define: { global: 'globalThis' },
  server: { port: 5173 },
})
