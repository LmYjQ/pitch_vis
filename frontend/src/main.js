import '@/styles/index.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import Components from '@/components'
const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(Components)
app.mount('#app')
