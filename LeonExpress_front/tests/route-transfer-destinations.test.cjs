const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const vue = require('vue')
const ts = require('typescript')
const { parse, compileScript } = require('@vue/compiler-sfc')

const filename = path.resolve(__dirname, '../src/pages/routes/RouteDetailPage.vue')
const { descriptor } = parse(fs.readFileSync(filename, 'utf8'))
const compiled = compileScript(descriptor, { id: 'transfer-destinations-test' })
const script = ts.transpileModule(compiled.content, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const route = (id, overrides = {}) => ({
  route_id: id, user_id: 'driver-1', warehouse_id: 'warehouse-1', status: 'PENDIENTE',
  route_type: 'ENTREGA', route_name: id, user: { full_name: 'Conductor' }, ...overrides,
})
function fixture({ admin = true, destinations = [] } = {}) {
  let routes = destinations, listRequests = 0
  const transfers = []
  const module = { exports: {} }
  vm.runInNewContext(script, {
    module, exports: module.exports, window: { confirm: () => true },
    require(id) {
      if (id === 'vue') return { ...vue, onMounted() {}, watch() {} }
      if (id === 'vue-router') return { useRoute: () => ({ params: { id: 'source' } }) }
      if (id === 'vuestic-ui') return {
        useToast: () => ({ init() {} }), defineVaDataTableColumns: (columns) => columns,
      }
      if (id.endsWith('/services/api')) return { default: {
        getRouteById: async () => ({ data: route('source', { status: 'EN_PROGRESO', routePackages: [] }) }),
        getPackages: async () => ({ data: { packages: [] } }),
        getRouteTransferDestinations: async () => {
          listRequests++
          if (routes instanceof Error) throw routes
          return { data: { routes } }
        },
        transferRoutePackages: async (...args) => { transfers.push(args) },
      } }
      if (id.endsWith('/sessionExpiry')) return {
        isSessionExpiredError: () => false, SESSION_EXPIRED_MESSAGE: 'Sesión expirada',
      }
      if (id.endsWith('/stores/user-store')) return {
        useUserStore: () => ({ isAdmin: admin, isDriver: !admin, user: { user_id: 'driver-1' } }),
      }
      if (id.endsWith('/data/comunas') || id.endsWith('.vue')) return {}
      throw new Error(`Unexpected import: ${id}`)
    },
  })
  const component = module.exports.default.setup({}, { expose() {} })
  return { component, transfers, setRoutes: (value) => { routes = value }, requests: () => listRequests }
}
function ids(component) {
  return Array.from(component.targetRouteOptions.value, (option) => option.value)
}

test('administrators can choose pending or in-progress delivery routes in the same warehouse', async () => {
  const f = fixture({ destinations: [
    route('source'), route('pending'), route('progress', { status: 'EN_PROGRESO' }),
    route('closed', { status: 'FINALIZADA' }), route('cancelled', { status: 'CANCELADA' }),
    route('returns', { route_type: 'DEVOLUCION' }), route('other-warehouse', { warehouse_id: 'warehouse-2' }),
    route('other-driver', { user_id: 'driver-2' }),
  ] })
  await f.component.fetchData()
  assert.deepEqual(ids(f.component), ['pending', 'progress', 'other-driver'])
})

test('administrators can also choose routes assigned to other drivers', async () => {
  const f = fixture({ admin: true, destinations: [route('source'), route('other-driver', { user_id: 'driver-2' })] })
  await f.component.fetchData()
  assert.deepEqual(ids(f.component), ['other-driver'])
})

test('an empty list explains the requirement for another open delivery route', async () => {
  const f = fixture({ destinations: [route('source')] })
  await f.component.fetchData()
  assert.deepEqual(ids(f.component), [])
  assert.match(f.component.emptyTargetRoutesText, /No hay otra ruta de entrega pendiente o en progreso/)
})

test('opening the selector refreshes routes created after page load and keeps selected packages', async () => {
  const f = fixture({ destinations: [route('source')] })
  await f.component.fetchData()
  f.component.selectedPending.value = [{ package_id: 'package-1' }]
  await f.component.refreshTargetRoutes(false)
  assert.equal(f.requests(), 1)
  f.setRoutes([route('source'), route('new-route')])
  await f.component.refreshTargetRoutes(true)
  assert.deepEqual(ids(f.component), ['new-route'])
  assert.equal(f.component.selectedPending.value[0].package_id, 'package-1')
  assert.equal(f.component.isLoadingTargetRoutes.value, false)
})

test('a destination that was closed is deselected when the list refreshes', async () => {
  const f = fixture({ destinations: [route('destination')] })
  await f.component.fetchData()
  f.component.targetRouteId.value = 'destination'
  f.setRoutes([route('destination', { status: 'FINALIZADA' })])
  await f.component.refreshTargetRoutes()
  assert.equal(f.component.targetRouteId.value, '')
  assert.deepEqual(ids(f.component), [])
})

test('list errors are explained separately and a retry can recover', async () => {
  const f = fixture({ destinations: [route('destination')] })
  await f.component.fetchData()
  f.component.targetRouteId.value = 'destination'
  f.setRoutes(new Error('Network error'))
  await f.component.refreshTargetRoutes()
  assert.match(f.component.targetRoutesError.value, /No se pudieron actualizar/)
  assert.equal(f.component.targetRouteId.value, '')
  f.setRoutes([route('destination')])
  await f.component.refreshTargetRoutes()
  assert.equal(f.component.targetRoutesError.value, '')
  assert.deepEqual(ids(f.component), ['destination'])
})

test('transfers require a valid destination and explicit physical handoff confirmation', async () => {
  const f = fixture({ destinations: [route('destination')] })
  await f.component.fetchData()
  f.component.selectedPending.value = [{ package_id: 'package-1' }]
  f.component.targetRouteId.value = 'missing'
  await f.component.handleTransferPending()
  assert.equal(f.transfers.length, 0)
  f.component.targetRouteId.value = 'destination'
  await f.component.handleTransferPending()
  assert.equal(f.transfers.length, 1)
  assert.equal(f.transfers[0][0], 'source')
  assert.equal(f.transfers[0][1], 'destination')
  assert.equal(f.transfers[0][2][0], 'package-1')
})

test('the assigned driver can add packages on an approved route in progress, never a closed or foreign route', () => {
  const f = fixture({ admin: false });
  f.component.routeData.value = route('source', { status: 'EN_PROGRESO', loading_status: 'APPROVED' });
  assert.equal(f.component.showScanner.value, true);
  for (const status of ['FINALIZADA', 'CANCELADA']) {
    f.component.routeData.value = route('source', { status });
    assert.equal(f.component.showScanner.value, false);
  }
  f.component.routeData.value = route('foreign', { status: 'EN_PROGRESO', user_id: 'driver-2' });
  assert.equal(f.component.showScanner.value, false);
});

test('drivers only see and submit their own destination routes', async () => {
  const f = fixture({ admin: false, destinations: [route('own'), route('foreign', { user_id: 'driver-2' })] });
  await f.component.fetchData();
  assert.deepEqual(ids(f.component), ['own']);
  f.component.selectedPending.value = [{ package_id: 'package-1' }];
  f.component.targetRouteId.value = 'foreign';
  await f.component.handleTransferPending();
  assert.equal(f.transfers.length, 0);
  f.component.targetRouteId.value = 'own';
  await f.component.handleTransferPending();
  assert.equal(f.transfers.length, 1);
});
