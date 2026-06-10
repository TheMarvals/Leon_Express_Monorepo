export interface INavigationRoute {
  name: string
  displayName: string
  meta: { icon: string }
  children?: INavigationRoute[]
}

export default {
  root: {
    name: '/',
    displayName: 'navigationRoutes.home',
  },
  routes: [
    {
      name: 'dashboard',
      displayName: 'menu.dashboard',
      meta: {
        icon: 'vuestic-iconset-dashboard',
      },
    },
    {
      name: 'users',
      displayName: 'Usuarios',
      meta: {
        icon: 'group',
      },
    },
    {
      name: 'clients',
      displayName: 'Partners',
      meta: {
        icon: 'handshake',
      },
    },
    {
      name: 'wharehouses',
      displayName: 'Almacenes',
      meta: {
        icon: 'fa4-warehouse',
      },
    },
    {
      name: 'routes',
      displayName: 'Rutas',
      meta: {
        icon: 'fa4-route',
      },
    },
    {
      name: 'deliveries',
      displayName: 'Entregas',
      meta: {
        icon: 'fa4-route',
      },
    },
    {
      name: 'Vehiculos',
      displayName: 'Vehiculos',
      meta: {
        icon: 'directions_car',
      },
      children: [
        {
          name: 'vehicles',
          displayName: 'Editar/Asignar',
        },
        {
          name: 'vehicles-type',
          displayName: 'Tipo de vehiculo',
        },
      ],
    },
    {
      name: 'Paquetes',
      displayName: 'Paquetes',
      meta: {
        icon: 'fa4-box',
      },
      children: [
        {
          name: 'pickups',
          displayName: 'Recolección',
        },
        {
          name: 'packages',
          displayName: 'Paquetes',
        },
        //                 {
        //   name: 'package-verification',
        //   displayName: 'Paquetes Verify',
        // },
      ],
    },

    {
      name: 'ocr-review',
      displayName: 'Revisión OCR',
      meta: {
        icon: 'fa4-camera',
      },
    },
    {
      name: 'financial', // Un nombre genérico para la categoría
      displayName: 'Finanzas',
      meta: { icon: 'fa4-money-bill' },
      children: [
        {
          name: 'payouts-list', // IMPORTANTE: Este nombre debe coincidir con el de tu router
          displayName: 'Liquidaciones',
        },
        {
          name: 'client-invoicing',
          displayName: 'Facturación Clientes',
        },
        {
          name: 'billing',
          displayName: 'Administración Financiera',
        },
      ],
    },
    {
      name: 'mercadolibre',
      displayName: 'menu.mercadolibre',
      meta: {
        icon: 'store',
      },
    },

    // {
    //   name: 'projects',
    //   displayName: 'menu.projects',
    //   meta: {
    //     icon: 'folder_shared',
    //   },
    // },
    // {
    //   name: 'payments',
    //   displayName: 'menu.payments',
    //   meta: {
    //     icon: 'credit_card',
    //   },
    //   children: [
    //     {
    //       name: 'payment-methods',
    //       displayName: 'menu.payment-methods',
    //     },
    //     {
    //       name: 'pricing-plans',
    //       displayName: 'menu.pricing-plans',
    //     },
    //     {
    //       name: 'billing',
    //       displayName: 'menu.billing',
    //     },
    //   ],
    // },
    // {
    //   name: 'auth',
    //   displayName: 'menu.auth',
    //   meta: {
    //     icon: 'login',
    //   },
    //   children: [
    //     {
    //       name: 'login',
    //       displayName: 'menu.login',
    //     },
    //     {
    //       name: 'signup',
    //       displayName: 'menu.signup',
    //     },
    //     {
    //       name: 'recover-password',
    //       displayName: 'menu.recover-password',
    //     },
    //   ],
    // },

    // {
    //   name: 'faq',
    //   displayName: 'menu.faq',
    //   meta: {
    //     icon: 'quiz',
    //   },
    // },
    // {
    //   name: '404',
    //   displayName: 'menu.404',
    //   meta: {
    //     icon: 'vuestic-iconset-files',
    //   },
    // },
    // {
    //   name: 'preferences',
    //   displayName: 'menu.preferences',
    //   meta: {
    //     icon: 'manage_accounts',
    //   },
    // },
    // {
    //   name: 'settings',
    //   displayName: 'menu.settings',
    //   meta: {
    //     icon: 'settings',
    //   },
    // },
  ] as INavigationRoute[],
}
