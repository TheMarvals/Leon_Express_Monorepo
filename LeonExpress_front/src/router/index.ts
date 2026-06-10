import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'
import AuthLayout from '../layouts/AuthLayout.vue'
import AppLayout from '../layouts/AppLayout.vue'
import RouteViewComponent from '../layouts/RouterBypass.vue'
import { useUserStore } from '@stores/user-store'
import { useToast } from 'vuestic-ui'
const { init } = useToast()

const routes: Array<RouteRecordRaw> = [
  {
    name: 'ADMIN',
    path: '/',
    component: AppLayout,
    redirect: { name: 'dashboard' },
    meta: { requiresAuth: true },
    children: [
      {
        name: 'dashboard',
        path: 'dashboard',
        component: () => import('../pages/dashboard/RoleDashboard.vue'),
      },
      {
        name: 'settings',
        path: 'settings',
        component: () => import('../pages/settings/Settings.vue'),
      },
      {
        name: 'preferences',
        path: 'preferences',
        component: () => import('../pages/preferences/Preferences.vue'),
      },
      {
        name: 'wharehouses',
        path: 'wharehouses',
        component: () => import('../pages/warehouses/WarehousesPage.vue'),
        meta: { roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      },
      {
        name: 'ocr-review',
        path: 'ocr-review',
        component: () => import('../pages/ocr-review/OcrReviewDashboard.vue'),
        meta: { roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      },
      {
        path: '/routes',
        name: 'routes',
        component: () => import('../pages/routes/RoutesPage.vue'),
      },
      {
        path: '/routes/:id',
        name: 'route-details',
        component: () => import('../pages/routes/RouteDetailPage.vue'),
      },
      {
        name: 'users',
        path: 'users',
        component: () => import('../pages/users/UsersPage.vue'),
        meta: { roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      },
      {
        name: 'clients',
        path: 'clients',
        component: () => import('../pages/clients/ClientsPage.vue'),
        meta: { roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      },
      {
        path: '/client-pricing/:id',
        name: 'client-pricing',
        component: () => import('../pages/clients/ClientPricingPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        name: 'vehicles-type',
        path: 'vehicles-type',
        component: () => import('../pages/vehicle-types/VehicleTypesPage.vue'),
        meta: { roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      },
      {
        name: 'vehicles',
        path: 'vehicles',
        component: () => import('../pages/vehicles/VehiclesPage.vue'),
        meta: { roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      },
      {
        name: 'pickups',
        path: 'pickups',
        component: () => import('../pages/pickups/PickupsPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        name: 'pickup-details',
        path: '/pickups/:id',
        component: () => import('../pages/pickups/PickupDetailPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        name: 'pickup-add-packages',
        path: '/pickups/:id/add-packages',
        component: () => import('../pages/pickups/AddPackagesPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        name: 'pickup-scan-packages',
        path: '/pickups/:id/scan',
        component: () => import('../pages/pickups/UnifiedPickupScanner.vue'),
        meta: { requiresAuth: true, roles: ['ADMIN', 'DRIVER'] },
      },
      {
        name: 'pickup-ml-scanner',
        path: '/pickups/:id/ml-scan',
        component: () => import('../pages/pickups/MlQrScanner.vue'),
        meta: { requiresAuth: true, roles: ['ADMIN', 'DRIVER'] },
      },
      {
        name: 'packages',
        path: 'packages',
        component: () => import('../pages/packages/PackagesPage.vue'),
        meta: { roles: ['ADMIN', 'WAREHOUSE_STAFF'] },
      },
      {
        name: 'package-verification',
        path: 'packages/verify', // La URL será /packages/verify
        component: () => import('../pages/packages/PackageVerificationPage.vue'),
        meta: {
          requiresAuth: true,
          roles: ['ADMIN', 'WAREHOUSE_STAFF'], // Solo estos roles pueden acceder
        },
      },
      {
        name: 'deliveries',
        path: 'deliveries',
        component: () => import('../pages/deliveries/DeliveriesPage.vue'),
        meta: { requiresAuth: true },
      },
      {
        name: 'package-details',
        path: '/packages/:id',
        component: () => import('../pages/packages/PackageDetailPage.vue'),
        meta: {
          requiresAuth: true,
        },
      },
      {
        path: 'payouts',
        component: RouteViewComponent, // Usamos un bypass para anidar rutas
        children: [
          {
            name: 'payouts-list',
            path: '', // La ruta base /payouts
            component: () => import('../pages/payouts/DriverPayoutsPage.vue'),
            meta: { title: 'Liquidaciones', requiresAuth: true, roles: ['ADMIN', 'DRIVER'] },
          },
          {
            name: 'payout-details',
            path: ':id', // La ruta de detalle /payouts/:id
            component: () => import('../pages/payouts/PayoutDetailsPage.vue'),
            meta: { title: 'Detalle Liquidación', requiresAuth: true, roles: ['ADMIN', 'DRIVER'] },
            props: (route) => ({ id: route.params.id }),
          },
        ],
      },

      // --- INICIO: MÓDULO DE FACTURACIÓN DE CLIENTES AÑADIDO ---
      {
        path: 'invoices', // La URL base será /invoices
        component: RouteViewComponent,
        children: [
          {
            name: 'client-invoicing', // Nombre para la lista, usado en el menú
            path: '', // Carga en /invoices
            component: () => import('../pages/invoices/ClientInvoicingPage.vue'),
            meta: { requiresAuth: true, roles: ['ADMIN', 'FINANCE'] },
          },
          {
            name: 'invoice-details', // Nombre para el detalle, usado en los botones
            path: ':id', // Carga en /invoices/:id
            component: () => import('../pages/invoices/InvoiceDetailPage.vue'),
            meta: { requiresAuth: true, roles: ['ADMIN', 'FINANCE'] },
            props: true, // Permite pasar el 'id' como prop al componente
          },
        ],
      },
      // --- FIN: MÓDULO DE FACTURACIÓN DE CLIENTES AÑADIDO ---

      // --- INICIO: MÓDULO DE ADMINISTRACIÓN FINANCIERA (BILLING) ---
      {
        name: 'billing',
        path: '/billing',
        component: () => import('../pages/billing/BillingPage.vue'),
        meta: { requiresAuth: true, roles: ['ADMIN'] },
      },
      // --- FIN: MÓDULO DE ADMINISTRACIÓN FINANCIERA (BILLING) ---

      {
        name: 'projects',
        path: 'projects',
        component: () => import('../pages/projects/ProjectsPage.vue'),
      },
      {
        name: 'mercadolibre',
        path: 'mercadolibre',
        component: () => import('../pages/mercadolibre/MercadoLibrePage.vue'),
        meta: { roles: ['ADMIN'] },
      },
      {
        name: 'payments',
        path: '/payments',
        component: RouteViewComponent,
        children: [
          {
            name: 'payment-methods',
            path: 'payment-methods',
            component: () => import('../pages/payments/PaymentsPage.vue'),
          },
          {
            name: 'pricing-plans',
            path: 'pricing-plans',
            component: () => import('../pages/pricing-plans/PricingPlans.vue'),
          },
        ],
      },
      {
        name: 'faq',
        path: '/faq',
        component: () => import('../pages/faq/FaqPage.vue'),
      },
    ],
  },
  {
    path: '/auth',
    component: AuthLayout,
    children: [
      {
        name: 'login',
        path: 'login',
        component: () => import('../pages/auth/Login.vue'),
      },
      {
        name: 'signup',
        path: 'signup',
        component: () => import('../pages/auth/Signup.vue'),
      },
      {
        name: 'recover-password',
        path: 'recover-password',
        component: () => import('../pages/auth/RecoverPassword.vue'),
      },
      {
        name: 'recover-password-email',
        path: 'recover-password-email',
        component: () => import('../pages/auth/CheckTheEmail.vue'),
      },
      {
        path: '',
        redirect: { name: 'login' },
      },
    ],
  },
  {
    path: '/print',
    component: () => import('../layouts/PrintLayout.vue'),
    children: [
      {
        path: 'invoices/:id',
        name: 'print-invoice',
        component: () => import('../pages/print/InvoicePrintPage.vue'),
      },
      {
        path: 'payouts/:id',
        name: 'print-payout',
        component: () => import('../pages/print/PayoutPrintPage.vue'),
      },
    ],
  },
  {
    name: '404',
    path: '/404',
    component: () => import('../pages/404.vue'),
  },
  {
    // CATCH-ALL MUST BE LAST
    path: '/:pathMatch(.*)*',
    redirect: { name: 'dashboard' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    if (to.hash) {
      return { el: to.hash, behavior: 'smooth' }
    } else {
      window.scrollTo(0, 0)
    }
  },
  routes,
})

// Navigation guard
router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()

  if (!userStore.sessionChecked) {
    await userStore.restoreSession()
  }

  const isLoggedIn = userStore.isLoggedIn
  const userRole = userStore.user?.role
  const requiredRoles = to.meta.roles as string[] | undefined

  if (to.meta.requiresAuth && !isLoggedIn) {
    return next({ name: 'login', query: { message: 'Por favor, inicia sesión.' } })
  }

  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(userRole)) {
    init({
      message: 'No tienes permisos para acceder a esta página.',
      color: 'danger',
    })
    return next(from.name ? false : { name: 'dashboard' })
  }

  if (to.name === 'login' && isLoggedIn) {
    return next({ name: 'dashboard' })
  }

  next()
})

export default router
