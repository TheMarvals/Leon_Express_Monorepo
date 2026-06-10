<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { Payout } from '../payouts/types'
import VuesticLogo from '../../components/VuesticLogo.vue'

const route = useRoute()
const payout = ref<Payout | null>(null)
const isLoading = ref(true)

const formatDate = (date: string) => (date ? new Date(date).toLocaleDateString('es-CL') : '-')
const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val)

const fetchData = async () => {
  try {
    const payoutId = route.params.id as string
    const { data } = await api.getPayoutById(payoutId)
    // Enrich items
    if (data.payoutItems) {
      data.payoutItems = data.payoutItems.map((item: any) => ({
        ...item,
        address: item.package?.destination_address || item.pickup?.pickup_address || '-',
        tracking_code: item.package?.tracking_code || item.pickup?.pickup_code || '-',
        date: item.package?.delivered_datetime || item.pickup?.pickup_scheduled_date || item.created_at,
      }))
    }
    payout.value = data
  } catch (error) {
    console.error('Error al cargar liquidación', error)
  } finally {
    isLoading.value = false
  }
}

const totalPaid = computed(() => {
  if (!payout.value?.payments) return 0
  return payout.value.payments.reduce((sum, p) => sum + Number(p.amount), 0)
})

const balanceDue = computed(() => {
  if (!payout.value) return 0
  return Number(payout.value.total_amount) - totalPaid.value
})

const sortedPayoutItems = computed(() => {
  if (!payout.value?.payoutItems) return []
  return [...payout.value.payoutItems].sort((a: any, b: any) => {
    const dateA = new Date(a.date).getTime()
    const dateB = new Date(b.date).getTime()

    if (dateB !== dateA) return dateB - dateA

    const aIsPickup = !!a.pickup || (a.item_description && a.item_description.toLowerCase().includes('recolección'))
    const bIsPickup = !!b.pickup || (b.item_description && b.item_description.toLowerCase().includes('recolección'))

    if (aIsPickup && !bIsPickup) return 1
    if (!aIsPickup && bIsPickup) return -1
    return 0
  })
})

const mode = ref<'detailed' | 'summary'>('detailed')

const print = () => {
  window.print()
}

const groupedItems = computed(() => {
  if (!payout.value?.payoutItems) return []

  const groups: Record<
    string,
    {
      id: string
      name: string
      date: string
      sortDate: number
      count: number
      total: number
      codCount: number
      codTotal: number
      uniquePackages: Set<string>
    }
  > = {}

  payout.value.payoutItems.forEach((item: any) => {
    let key = 'others'
    let name = 'Otros / Sin Ruta'
    let date = '-'
    let sortDate = 0

    // Check if it belongs to a route
    if (item.package?.routePackages?.[0]?.route) {
      const route = item.package.routePackages[0].route
      key = `route_${route.route_id}`
      name = `Ruta: ${route.route_name || 'Sin nombre'} (${route.route_id.slice(0, 8)})`
      date = route.start_date ? new Date(route.start_date).toLocaleDateString('es-CL') : '-'
      sortDate = route.start_date ? new Date(route.start_date).getTime() : 0
    } else if (item.pickup) {
      key = `pickup_${item.pickup.pickup_id}`
      name = `Recolección: ${item.pickup.client?.client_name || 'Cliente'} (${item.pickup.pickup_id.slice(0, 8)})`
      date = item.pickup.pickup_scheduled_date
        ? new Date(item.pickup.pickup_scheduled_date).toLocaleDateString('es-CL')
        : '-'
      sortDate = item.pickup.pickup_scheduled_date ? new Date(item.pickup.pickup_scheduled_date).getTime() : 0
    }

    if (!groups[key]) {
      groups[key] = {
        id: key,
        name,
        date,
        sortDate,
        count: 0,
        total: 0,
        codCount: 0,
        codTotal: 0,
        uniquePackages: new Set(),
      }
    }

    const descText = item.item_description || ''
    const desc = descText.toLowerCase()
    const isDelivery = desc.includes('entrega')
    const isCod = /\bcod\b/.test(desc)

    // Si tiene package_id, lo registramos para contar paquetes únicos
    if (item.package_id) {
      groups[key].uniquePackages.add(item.package_id)
    } else if (isDelivery || isCod) {
      groups[key].count++
    }

    if (isCod) {
      groups[key].codCount++

      // Prioridad 1: Usar el cod_amount real del paquete si está disponible
      // Prioridad 2: Intentar extraer del texto (casos fusionados)
      // Prioridad 3: Usar el monto del item (casos independientes)
      const pkgCod = Number(item.package?.cod_amount)
      const codRegex = /\(\+ Retención COD \$(\d+)\)/
      const match = descText.match(codRegex)

      if (!isNaN(pkgCod) && pkgCod > 0) {
        groups[key].codTotal += pkgCod
      } else if (match) {
        groups[key].codTotal += Number(match[1])
      } else {
        groups[key].codTotal += Math.abs(Number(item.amount || 0))
      }
    }

    groups[key].total += Number(item.amount || 0)
  })

  // Finalizar el conteo de paquetes basados en Set
  return Object.values(groups)
    .sort((a, b) => b.sortDate - a.sortDate)
    .map((g) => ({
      ...g,
      count: g.uniquePackages.size + g.count,
    }))
})

onMounted(fetchData)
</script>

<template>
  <div v-if="payout" class="print-container">
    <!-- Header -->
    <div class="header">
      <div class="company-section">
        <div class="logo-wrapper">
          <VuesticLogo class="logo-img" />
        </div>
        <p class="subtitle">Comprobante de Liquidación</p>
      </div>

      <div class="invoice-meta">
        <h2 class="document-title">VOUCHER</h2>
        <div class="meta-box">
          <table>
            <tr>
              <td><strong>Folio:</strong></td>
              <td>#{{ payout.payout_id.slice(0, 8).toUpperCase() }}</td>
            </tr>
            <tr>
              <td><strong>Fecha:</strong></td>
              <td>{{ formatDate(payout.payout_date) }}</td>
            </tr>
            <tr>
              <td><strong>Estado:</strong></td>
              <td>{{ payout.status }}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>

    <!-- Driver Info -->
    <div class="driver-section">
      <div class="driver-box">
        <h3>CONDUCTOR:</h3>
        <p class="driver-name">{{ payout.user?.full_name }}</p>
        <div class="driver-details">
          <p><strong>Email:</strong> {{ payout.user?.email }}</p>
          <p><strong>Teléfono:</strong> {{ payout.user?.phone }}</p>
        </div>
      </div>
    </div>

    <!-- Payments Summary -->
    <div v-if="payout.payments && payout.payments.length > 0" class="payments-section">
      <h3>Historial de Pagos</h3>
      <table class="simple-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Método</th>
            <th>Referencia</th>
            <th style="text-align: right">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pay in payout.payments" :key="pay.payment_id">
            <td>{{ formatDate(pay.payment_date) }}</td>
            <td>{{ pay.payment_method }}</td>
            <td>{{ pay.transaction_reference }}</td>
            <td style="text-align: right">{{ formatCurrency(Number(pay.amount)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Controls (No Print) -->
    <div class="no-print controls">
      <div class="toggle-group">
        <button :class="{ active: mode === 'detailed' }" @click="mode = 'detailed'">Detallado</button>
        <button :class="{ active: mode === 'summary' }" @click="mode = 'summary'">Resumen (Por Ruta)</button>
      </div>
      <button class="print-btn" @click="print">🖨️ Imprimir</button>
    </div>

    <!-- Items Table (Detailed) -->
    <div v-if="mode === 'detailed'" class="items-section">
      <h3>Detalle de Servicios</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: left">Descripción</th>
            <th style="text-align: left">Fecha</th>
            <th style="text-align: left">Dirección</th>
            <th style="text-align: left">Tracking</th>
            <th style="text-align: right">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in sortedPayoutItems" :key="item.payout_item_id">
            <td>{{ item.item_description }}</td>
            <td style="white-space: nowrap">{{ formatDate(item.date || '') }}</td>
            <td>{{ item.address }}</td>
            <td>{{ item.tracking_code }}</td>
            <td style="text-align: right">{{ formatCurrency(item.amount) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Items Table (Summary) -->
    <div v-else class="items-section">
      <h3>Resumen por Ruta</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: left">RUTA / ORIGEN</th>
            <th style="text-align: left">FECHA</th>
            <th style="text-align: right">PAQUETES</th>
            <th style="text-align: right">COD QTY</th>
            <th style="text-align: right">MONTO COD</th>
            <th style="text-align: right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groupedItems" :key="group.id">
            <td>{{ group.name }}</td>
            <td>{{ group.date }}</td>
            <td style="text-align: right">{{ group.count }}</td>
            <td style="text-align: right">
              <span v-if="group.codCount > 0">{{ group.codCount }}</span>
              <span v-else class="text-gray-400">0</span>
            </td>
            <td style="text-align: right">
              <!-- Mostramos el monto COD como negativo o positivo? -->
              <!-- En la deducción al driver es un descuento, así que lo mostramos como valor para informar -->
              <span v-if="group.codTotal > 0">{{ formatCurrency(group.codTotal) }}</span>
              <span v-else class="text-gray-400">$0</span>
            </td>
            <td style="text-align: right" :class="{ 'text-danger': group.total < 0 }">
              {{ formatCurrency(group.total) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row subtotal">
          <span>Total Liquidado:</span>
          <span>{{ formatCurrency(payout.total_amount) }}</span>
        </div>
        <div class="total-row paid">
          <span>Total Pagado:</span>
          <span>{{ formatCurrency(totalPaid) }}</span>
        </div>
        <div class="total-row balance">
          <span>Pendiente:</span>
          <span>{{ formatCurrency(balanceDue) }}</span>
        </div>
      </div>
    </div>

    <!-- Signatures -->
    <div class="signatures">
      <div class="signature-box">
        <div class="line"></div>
        <p>Firma y Aclaración<br /><strong>Leon Express</strong></p>
      </div>
      <div class="signature-box">
        <div class="line"></div>
        <p>
          Recibí Conforme<br /><strong>{{ payout.user?.full_name }}</strong>
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Este documento sirve como comprobante de los servicios prestados y pagados.</p>
    </div>
  </div>
  <div v-else class="loading">Cargando liquidación...</div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');

* {
  box-sizing: border-box;
}
body {
  background: white;
  margin: 0;
  padding: 0;
}

.print-container {
  font-family: 'Roboto', Helvetica, Arial, sans-serif;
  max-width: 210mm;
  margin: 0 auto;
  padding: 40px;
  background: white;
  color: #333;
}

/* Header & Typography same as Invoice */
.header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 40px;
}

.logo-wrapper {
  margin-bottom: 0px;
}

:deep(.logo-img .cls-1),
:deep(.logo-img .cls-3) {
  fill: #03323a !important;
}
:deep(.logo-img .cls-2) {
  fill: #fff !important;
}

:deep(.logo-img) {
  height: 80px;
  width: auto;
}

.subtitle {
  font-size: 14px;
  color: #666;
  margin: 5px 0 0 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.document-title {
  font-size: 28px;
  font-weight: 900;
  margin: 0 0 10px 0;
  text-align: right;
}
.meta-box table {
  float: right;
}
.meta-box td {
  padding: 2px 0 2px 15px;
  text-align: right;
  font-size: 14px;
}

/* Sections */
.driver-section {
  margin-bottom: 30px;
  background-color: #f8fafc;
  border-radius: 6px;
  padding: 15px;
  border-left: 4px solid #03323a; /* Updated Color */
}
.driver-name {
  font-size: 18px;
  font-weight: 700;
  color: #03323a; /* Updated Color */
  margin: 0 0 10px 0;
}
.driver-details p {
  margin: 2px 0;
  font-size: 13px;
}

h3 {
  font-size: 14px;
  text-transform: uppercase;
  color: #666;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
  margin-bottom: 10px;
}

/* Tables */
.simple-table,
.items-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
}
th {
  text-align: left;
  font-size: 12px;
  color: #666;
  text-transform: uppercase;
  padding: 8px 5px;
  border-bottom: 2px solid #eee;
}
td {
  padding: 8px 5px;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.items-table th {
  background-color: #03323a; /* Updated Color */
  color: white;
}

/* Totals */
.totals-section {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
}
.totals-box {
  width: 250px;
}
.total-row {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 14px;
}
.total-row.balance {
  font-weight: bold;
  border-top: 2px solid #333;
  margin-top: 5px;
  padding-top: 10px;
  font-size: 16px;
}

/* Signatures */
.signatures {
  display: flex;
  justify-content: space-between;
  margin-top: 60px;
}
.signature-box {
  width: 40%;
  text-align: center;
}
.signature-box .line {
  border-top: 1px solid #333;
  margin-bottom: 10px;
}
.signature-box p {
  font-size: 12px;
  line-height: 1.4;
}

.footer {
  text-align: center;
  margin-top: 40px;
  font-size: 11px;
  color: #999;
  border-top: 1px solid #eee;
  padding-top: 10px;
}

.loading {
  display: flex;
  justifycontent: center;
  alignitems: center;
  height: 100vh;
}

@media print {
  @page {
    margin: 0;
    size: auto;
  }
  body {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .print-container {
    width: 100%;
    max-width: 100%;
    padding: 15mm;
  }
  .no-print {
    display: none !important;
  }
}

.controls {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
  background: #f0f0f0;
  padding: 10px;
  border-radius: 8px;
}

.toggle-group {
  display: flex;
  gap: 10px;
}

.toggle-group button {
  padding: 8px 16px;
  border: 1px solid #ccc;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.toggle-group button.active {
  background: #03323a;
  color: white;
  border-color: #03323a;
}

.print-btn {
  padding: 8px 24px;
  background: #28a745;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}
</style>
