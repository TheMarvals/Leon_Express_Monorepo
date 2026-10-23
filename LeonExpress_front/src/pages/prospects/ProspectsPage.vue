<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getProspects, updateProspect, type Prospect, type ProspectStatus } from '@/services/prospects'
const items = ref<Prospect[]>([])
const total = ref(0)
const page = ref(1)
const status = ref('')
const search = ref('')
const loading = ref(false)
const saving = ref('')
const error = ref('')
const expanded = ref('')
const labels: Record<ProspectStatus, string> = { NEW: 'Nueva', CONTACTED: 'Contactada', CLOSED: 'Cerrada' }
const emailLabels = {
  PENDING: 'Aviso pendiente',
  SENT: 'Correo enviado',
  FAILED: 'Falló el aviso por correo',
  NOT_CONFIGURED: 'Sin receptor de correo configurado',
}
let requestNumber = 0
async function load(reset = false) {
  if (reset) page.value = 1
  const current = ++requestNumber
  loading.value = true
  error.value = ''
  try {
    const { data } = await getProspects({
      status: status.value || undefined,
      search: search.value || undefined,
      page: page.value,
    })
    if (current !== requestNumber) return
    items.value = data.items
    total.value = data.total
  } catch {
    if (current === requestNumber) error.value = 'No se pudieron cargar las solicitudes. Intenta nuevamente.'
  } finally {
    if (current === requestNumber) loading.value = false
  }
}
onMounted(() => load())
async function changeStatus(item: Prospect, event: Event) {
  const input = event.target as HTMLSelectElement
  const next = input.value as ProspectStatus
  const previous = item.status
  input.value = previous
  if (saving.value) return
  saving.value = item.prospect_id
  error.value = ''
  try {
    await updateProspect(item.prospect_id, next)
    await load()
  } catch (err: any) {
    error.value = err.response?.data?.error || 'No se pudo actualizar el estado.'
  } finally {
    saving.value = ''
  }
}
const date = (value: string) =>
  new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(
    new Date(value),
  )
async function turnPage(delta: number) {
  page.value += delta
  await load()
}
</script>
<template>
  <section class="prospects-page">
    <header class="page-header">
      <div>
        <h1>Solicitudes comerciales</h1>
        <p>Empresas que quieren enviar con León Express. Una solicitud no habilita acceso al portal.</p>
      </div>
      <RouterLink to="/dashboard" class="config-link">Configurar avisos ↗</RouterLink>
    </header>
    <VaCard
      ><VaCardContent
        ><form class="list-toolbar" @submit.prevent="load(true)">
          <label class="search-label"
            >Buscar empresa o contacto<input
              v-model="search"
              type="search"
              placeholder="Empresa, nombre o correo"
              maxlength="100" /></label
          ><label
            >Estado<select v-model="status" @change="load(true)">
              <option value="">Todos los estados</option>
              <option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option>
            </select></label
          ><VaButton type="submit" :disabled="loading">Buscar</VaButton>
        </form>
        <p v-if="error" role="alert" class="load-error">{{ error }}</p>
        <p v-if="loading" class="list-message" role="status">Cargando solicitudes…</p>
        <p v-else-if="!items.length && !error" class="list-message">
          {{
            search || status
              ? 'No hay solicitudes con esos filtros.'
              : 'Aún no hay solicitudes. Las empresas podrán contactarte desde la página de inicio.'
          }}
        </p>
        <template v-else-if="!error"
          ><div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Empresa / contacto</th>
                  <th>Comuna</th>
                  <th>Envíos diarios</th>
                  <th>Recibida</th>
                  <th>Estado</th>
                  <th><span class="sr-only">Detalle</span></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="item in items" :key="item.prospect_id"
                  ><tr>
                    <td>
                      <strong>{{ item.company }}</strong
                      ><span class="secondary">{{ item.contact_name }}</span
                      ><a :href="`mailto:${item.email}`">{{ item.email }}</a>
                    </td>
                    <td>{{ item.commune }}</td>
                    <td>{{ item.volume }}</td>
                    <td>{{ date(item.created_at) }}</td>
                    <td>
                      <select
                        :value="item.status"
                        :disabled="!!saving"
                        :aria-label="`Estado de ${item.company}`"
                        @change="changeStatus(item, $event)"
                      >
                        <option v-for="(label, key) in labels" :key="key" :value="key">{{ label }}</option>
                      </select>
                    </td>
                    <td>
                      <button
                        class="detail-button"
                        :aria-expanded="expanded === item.prospect_id"
                        @click="expanded = expanded === item.prospect_id ? '' : item.prospect_id"
                      >
                        {{ expanded === item.prospect_id ? 'Ocultar' : 'Ver detalle' }}
                      </button>
                    </td>
                  </tr>
                  <tr v-if="expanded === item.prospect_id" class="detail-row">
                    <td colspan="6">
                      <div class="detail-grid">
                        <div>
                          <span class="detail-label">TELÉFONO / WHATSAPP</span
                          ><a :href="`tel:${item.phone.replace(/[^+0-9]/g, '')}`">{{ item.phone }}</a>
                        </div>
                        <div>
                          <span class="detail-label">NOTIFICACIÓN</span
                          ><span :class="{ 'mail-warning': item.email_status !== 'SENT' }">{{
                            emailLabels[item.email_status]
                          }}</span>
                        </div>
                        <div class="full-detail">
                          <span class="detail-label">MENSAJE</span>
                          <p class="prospect-message">{{ item.message || 'Sin comentarios adicionales.' }}</p>
                        </div>
                      </div>
                      <p class="detail-help">
                        Cuando acuerden las condiciones del servicio, envía la invitación desde
                        <RouterLink to="/clients">Partners → Invitar Cliente</RouterLink>.
                      </p>
                    </td>
                  </tr></template
                >
              </tbody>
            </table>
          </div>
          <div class="pagination">
            <span>{{ total }} solicitudes</span>
            <div>
              <VaButton preset="secondary" :disabled="page <= 1 || loading" @click="turnPage(-1)">Anterior</VaButton
              ><span>Página {{ page }} de {{ Math.max(1, Math.ceil(total / 20)) }}</span
              ><VaButton preset="secondary" :disabled="page * 20 >= total || loading" @click="turnPage(1)"
                >Siguiente</VaButton
              >
            </div>
          </div></template
        >
        <VaButton v-if="error" preset="secondary" @click="load()">Reintentar</VaButton>
      </VaCardContent></VaCard
    >
  </section>
</template>
<style scoped>
.prospects-page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}
.page-header h1 {
  font-size: 1.75rem;
  font-weight: 700;
  margin-bottom: 10px;
}
.page-header p {
  font-size: 0.875rem;
  line-height: 1.6;
  color: #64748b;
}
.config-link {
  font-size: 0.85rem;
  color: var(--va-primary);
  font-weight: 600;
  white-space: nowrap;
}
.list-toolbar {
  display: flex;
  gap: 14px;
  align-items: flex-end;
  margin-bottom: 20px;
}
.list-toolbar label {
  font-size: 0.75rem;
  font-weight: 600;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.search-label {
  flex: 1;
  max-width: 420px;
}
.list-toolbar input,
select {
  border: 1px solid #d2dddd;
  background: var(--va-background-element);
  color: var(--va-on-background-primary);
  padding: 9px 12px;
  border-radius: 5px;
  min-height: 38px;
  font: inherit;
  font-size: 0.8rem;
}
.list-message {
  text-align: center;
  padding: 45px 20px;
  color: #64748b;
  line-height: 1.7;
}
.load-error {
  color: #b52d29;
  margin: 15px 0;
  line-height: 1.5;
}
.table-wrapper {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
th {
  text-align: left;
  background: var(--va-background-secondary);
  font-size: 0.65rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  padding: 13px 12px;
  white-space: nowrap;
}
td {
  padding: 17px 12px;
  border-bottom: 1px solid #e3e9e9;
  line-height: 1.7;
  vertical-align: middle;
}
td strong,
.secondary,
td > a {
  display: block;
}
.secondary {
  color: #64748b;
  font-size: 0.75rem;
}
td > a {
  color: var(--va-primary);
  font-size: 0.75rem;
}
td select {
  min-width: 115px;
}
.detail-button {
  white-space: nowrap;
  color: var(--va-primary);
  font-weight: 600;
  cursor: pointer;
}
.detail-row td {
  background: var(--va-background-secondary);
  padding: 22px;
}
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.detail-grid > div {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.full-detail {
  grid-column: 1/-1;
}
.detail-label {
  font-size: 0.65rem;
  color: #64748b;
  letter-spacing: 0.6px;
}
.prospect-message {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-width: 850px;
}
.mail-warning {
  color: #936215;
}
.detail-help {
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 20px;
}
.detail-help a {
  text-decoration: underline;
  color: var(--va-primary);
}
.pagination {
  display: flex;
  justify-content: space-between;
  gap: 15px;
  align-items: center;
  font-size: 0.75rem;
  margin-top: 20px;
}
.pagination > div {
  display: flex;
  align-items: center;
  gap: 15px;
}
@media (max-width: 760px) {
  .page-header,
  .list-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .search-label {
    max-width: none;
  }
  .pagination {
    flex-direction: column;
  }
  .pagination > div {
    gap: 8px;
  }
  .detail-grid {
    grid-template-columns: 1fr;
  }
  .full-detail {
    grid-column: auto;
  }
}
</style>
