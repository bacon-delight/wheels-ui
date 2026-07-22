import { Buffer } from 'buffer'
import { createPinia } from 'pinia'
import { createApp } from 'vue'

import App from './App.vue'
import router from './router'
import './style.css'

// amazon-cognito-identity-js expects Node's Buffer/global in the browser.
if (!window.Buffer) window.Buffer = Buffer
if (!window.global) window.global = window

createApp(App).use(createPinia()).use(router).mount('#app')
