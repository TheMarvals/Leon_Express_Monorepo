import { requestNotificationPermission } from './registerServiceWorker'
import './scss/main.scss'
import { createApp } from 'vue'
import App from './App.vue'
import i18n from './i18n'
import { createVuestic } from 'vuestic-ui'
import { createGtm } from '@gtm-support/vue-gtm'
import { createPinia } from 'pinia'
import piniaPersistedstate from 'pinia-plugin-persistedstate'
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faSearch,
  faArrowUp,
  faArrowDown,
  faArrowRight,
  faMoneyBill,
  faChevronDown,
  faBell,
  faArrowLeft,
  faBars,
  faXmark,
  faUserCircle,
  faFileInvoice,
  faQuestionCircle,
  faLifeRing,
  faSignOutAlt,
  faCaretDown,
  faHeart,
  faCalendarDays,
  faExclamationTriangle,
  faClock,
  faUserPlus,
  faExclamationCircle,
  faChartLine,
  faDesktop,
  faBellSlash,
  faUsers,
  faSpinner,
  faCheckCircle,
  faTimesCircle,
  faRefresh,
  faEye,
  faEyeSlash,
  faCamera,
  faTimes,
  faPlus,
  faMapMarker,
  faCalendar,
  faCaretUp,
  faUpload,
} from '@fortawesome/free-solid-svg-icons'
import '@fortawesome/fontawesome-free/css/all.css'

// Registro global de Chart.js
import {
  Chart as ChartJS,
  Title,
  Tooltip,
  Legend,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  ArcElement,
  Filler,
} from 'chart.js'

ChartJS.register(
  Title,
  Tooltip,
  Legend,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  ArcElement,
  Filler,
)

const pinia = createPinia()
pinia.use(piniaPersistedstate)

library.add(
  faSearch,
  faArrowUp,
  faArrowDown,
  faArrowRight,
  faMoneyBill,
  faChevronDown,
  faBell,
  faArrowLeft,
  faBars,
  faXmark,
  faUserCircle,
  faFileInvoice,
  faQuestionCircle,
  faLifeRing,
  faSignOutAlt,
  faCaretDown,
  faHeart,
  faCalendarDays,
  faExclamationTriangle,
  faClock,
  faUserPlus,
  faExclamationCircle,
  faChartLine,
  faDesktop,
  faBellSlash,
  faUsers,
  faSpinner,
  faCheckCircle,
  faTimesCircle,
  faRefresh,
  faEye,
  faEyeSlash,
  faCamera,
  faTimes,
  faPlus,
  faMapMarker,
  faCalendar,
  faCaretUp,
  faUpload,
)

import stores from './stores'
import router from './router'
import vuesticGlobalConfig from './services/vuestic-ui/global-config'

const app = createApp(App)

app.use(stores)
app.use(router)
app.use(i18n)
app.use(createVuestic({ config: vuesticGlobalConfig }))
app.use(pinia)

if (import.meta.env.VITE_APP_GTM_ENABLED) {
  app.use(
    createGtm({
      id: import.meta.env.VITE_APP_GTM_KEY,
      debug: false,
      vueRouter: router,
    }),
  )
}

app.component('FontAwesomeIcon', FontAwesomeIcon)

// Registrar Service Worker y pedir permisos de notificaciones push
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    requestNotificationPermission()
  })
}

app.mount('#app')
