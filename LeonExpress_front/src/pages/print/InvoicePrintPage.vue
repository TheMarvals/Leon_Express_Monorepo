<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import api from '@/services/api'
import { Invoice } from '../invoices/types'
import VuesticLogo from '../../components/VuesticLogo.vue'

const route = useRoute()
const invoice = ref<Invoice | null>(null)
const isLoading = ref(true)

const formatDate = (date: string) => new Date(date).toLocaleDateString('es-CL')

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(val)

const fetchInvoiceDetails = async () => {
  try {
    const invoiceId = route.params.id as string
    const { data } = await api.getInvoiceById(invoiceId)
    invoice.value = data
  } catch (error) {
    console.error('Error al cargar factura', error)
  } finally {
    isLoading.value = false
  }
}

const totalPaid = computed(() => {
  if (!invoice.value?.payments) return 0
  return invoice.value.payments.reduce((sum, p) => sum + Number(p.amount), 0)
})

const balanceDue = computed(() => {
  if (!invoice.value) return 0
  return invoice.value.total_amount - totalPaid.value
})

const mode = ref<'detailed' | 'summary'>('detailed')

const print = () => {
  window.print()
}

const groupedItems = computed(() => {
  if (!invoice.value?.invoiceItems) return []

  const groups: Record<
    string,
    {
      id: string
      name: string
      date: string
      sortDate: number
      packageCount: number
      otherCount: number
      total: number
      codTotal: number
      packageCodes: Set<string>
      pickup_id: string | null
    }
  > = {}

  invoice.value.invoiceItems.forEach((item: any) => {
    let key = 'others'
    let name = 'Otros / Sin Recolección'
    let date = '-'
    let sortDate = 0

    // Check if it belongs to a pickup
    if (item.package?.pickup) {
      const pickup = item.package.pickup
      key = `pickup_${pickup.pickup_id}`
      name = `Recolección #${pickup.pickup_id.slice(0, 8)}`
      date = pickup.pickup_scheduled_date ? new Date(pickup.pickup_scheduled_date).toLocaleDateString('es-CL') : '-'
      sortDate = pickup.pickup_scheduled_date ? new Date(pickup.pickup_scheduled_date).getTime() : 0
    }

    if (!groups[key]) {
      groups[key] = {
        id: key,
        name,
        date,
        sortDate,
        packageCount: 0,
        otherCount: 0,
        total: 0,
        codTotal: 0,
        packageCodes: new Set(),
        pickup_id: null,
      }
    }

    // Assign pickup_id if present
    if (item.package?.pickup) {
      groups[key].pickup_id = item.package.pickup.pickup_id
    }

    const desc = (item.description || '').toLowerCase()
    const isCod = /\bcod\b/.test(desc)

    if (isCod) {
      groups[key].codTotal += Math.abs(Number(item.amount || 0))
    }

    if (item.package?.tracking_code) {
      groups[key].packageCodes.add(item.package.tracking_code)
    } else {
      groups[key].otherCount += Number(item.quantity || 0)
    }

    groups[key].total += Number(item.amount || 0)
  })

  return Object.values(groups)
    .sort((a, b) => b.sortDate - a.sortDate)
    .map((g) => ({
      ...g,
      count: g.packageCodes.size + g.otherCount,
    }))
})

const invoiceSummary = computed(() => {
  if (!invoice.value?.invoiceItems) return { gross: 0, codCredits: 0, codCount: 0 }

  let gross = 0
  let codCredits = 0
  const codPackages = new Set()

  invoice.value.invoiceItems.forEach((item: any) => {
    const amount = Number(item.amount || 0)
    const desc = (item.description || '').toLowerCase()

    if (amount > 0) {
      gross += amount
    } else if (/\bcod\b/.test(desc)) {
      codCredits += Math.abs(amount)
      if (item.package?.tracking_code) {
        codPackages.add(item.package.tracking_code)
      }
    }
  })

  return {
    gross,
    codCredits,
    codCount: codPackages.size,
  }
})

const uniquePackageCount = computed(() => {
  if (!invoice.value?.invoiceItems) return 0
  const codes = new Set()
  invoice.value.invoiceItems.forEach((item: any) => {
    if (item.package?.tracking_code) {
      codes.add(item.package.tracking_code)
    }
  })
  return codes.size
})

onMounted(fetchInvoiceDetails)
</script>

<template>
  <div v-if="invoice" class="print-container">
    <!-- Header -->
    <div class="header">
      <div class="company-section">
        <div class="logo-wrapper">
          <VuesticLogo class="logo-img" />
        </div>
        <p class="subtitle">Logística de Envíos</p>
        <div class="company-details">
          <p>Santiago, Chile</p>
          <p>Email: contacto@leonexpress.cl</p>
          <p>Web: www.leonexpress.cl</p>
        </div>
      </div>

      <div class="invoice-meta">
        <h2 class="document-title">FACTURA</h2>
        <div class="meta-box">
          <table>
            <tr>
              <td><strong>Número:</strong></td>
              <td>#{{ invoice.invoice_number }}</td>
            </tr>
            <tr>
              <td><strong>Fecha Emisión:</strong></td>
              <td>{{ formatDate(invoice.invoice_date) }}</td>
            </tr>
            <tr>
              <td><strong>Vencimiento:</strong></td>
              <td>{{ formatDate(invoice.due_date) }}</td>
            </tr>
          </table>
        </div>
      </div>
    </div>

    <!-- Client Info -->
    <div class="client-section">
      <div class="client-box">
        <h3>FACTURAR A:</h3>
        <p class="client-name">{{ invoice.client?.client_name }}</p>
        <div class="client-details">
          <p v-if="invoice.client?.address"><strong>Dirección:</strong> {{ invoice.client?.address }}</p>
          <p v-if="invoice.client?.email"><strong>Email:</strong> {{ invoice.client?.email }}</p>
          <p v-if="invoice.client?.phone"><strong>Teléfono:</strong> {{ invoice.client?.phone }}</p>
        </div>
      </div>
    </div>

    <!-- Controls (No Print) -->
    <div class="no-print controls">
      <div class="toggle-group">
        <button :class="{ active: mode === 'detailed' }" @click="mode = 'detailed'">Detallado</button>
        <button :class="{ active: mode === 'summary' }" @click="mode = 'summary'">Resumen (Por Recolección)</button>
      </div>
      <button class="print-btn" @click="print">🖨️ Imprimir</button>
    </div>

    <!-- Items Table (Detailed) -->
    <div v-if="mode === 'detailed'" class="items-section">
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: left">Descripción</th>
            <th style="text-align: left">Tracking Interno</th>
            <th style="text-align: left">Tracking Externo</th>
            <th style="text-align: right">Cantidad</th>
            <th style="text-align: right">Precio Unit.</th>
            <th style="text-align: right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in invoice.invoiceItems" :key="item.description">
            <td>{{ item.description }}</td>
            <td>{{ item.package?.tracking_code || '-' }}</td>
            <td>{{ item.package?.external_tracking_code || '-' }}</td>
            <td style="text-align: right">{{ item.quantity }}</td>
            <td style="text-align: right">{{ formatCurrency(item.unit_price) }}</td>
            <td style="text-align: right">{{ formatCurrency(item.amount) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Items Table (Summary) -->
    <div v-else class="items-section">
      <h3>Resumen por Recolección</h3>
      <table class="items-table">
        <thead>
          <tr>
            <th style="text-align: left">Recolección</th>
            <th style="text-align: left">Fecha</th>
            <th style="text-align: right">Paquetes</th>
            <th style="text-align: right">Monto COD</th>
            <th style="text-align: right">Total</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="group in groupedItems" :key="group.id">
            <td>
              <RouterLink
                v-if="group.pickup_id"
                :to="{ name: 'pickup-details', params: { id: group.pickup_id } }"
                class="pickup-link no-print-link"
                target="_blank"
              >
                {{ group.name }}
              </RouterLink>
              <span v-else>{{ group.name }}</span>
            </td>
            <td>{{ group.date }}</td>
            <td style="text-align: right">{{ group.count }}</td>
            <td style="text-align: right">
              <span v-if="group.codTotal > 0">{{ formatCurrency(group.codTotal) }}</span>
              <span v-else class="text-gray-400">$0</span>
            </td>
            <td style="text-align: right">{{ formatCurrency(group.total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row subtotal">
          <span>Servicios ({{ uniquePackageCount }} pqts):</span>
          <span>{{ formatCurrency(invoiceSummary.gross) }}</span>
        </div>
        <div v-if="invoiceSummary.codCount > 0" class="total-row cod-info">
          <span>Créditos COD ({{ invoiceSummary.codCount }} pqts):</span>
          <span>-{{ formatCurrency(invoiceSummary.codCredits) }}</span>
        </div>
        <div class="total-row grand-total">
          <span>TOTAL:</span>
          <span>{{ formatCurrency(invoice.total_amount) }}</span>
        </div>
        <div class="total-row paid-info">
          <span>Pagado:</span>
          <span>{{ formatCurrency(totalPaid) }}</span>
        </div>
        <div class="total-row balance-info">
          <span>Por Pagar:</span>
          <span>{{ formatCurrency(balanceDue) }}</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Gracias por su preferencia.</p>
      <p style="font-size: 0.8rem; margin-top: 5px; color: #999">Generado por Sistema de Gestión Leon Express</p>
    </div>
  </div>
  <div v-else class="loading">Cargando documento...</div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap');

/* Reset */
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
  max-width: 210mm; /* A4 width */
  margin: 0 auto;
  padding: 40px;
  background: white;
  color: #333;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 50px;
}

.logo-wrapper {
  margin-bottom: 0px;
}

/* Force logo colors via CSS deep selector since it is an SVG component */
:deep(.logo-img .cls-1),
:deep(.logo-img .cls-3) {
  fill: #03323a !important;
}
:deep(.logo-img .cls-2) {
  fill: #fff !important; /* mantener blanco o ajustar si necesario */
}

/* Ajustar tamaño del logo si es necesario */
:deep(.logo-img) {
  height: 80px;
  width: auto;
}

.subtitle {
  font-size: 16px;
  color: #666;
  margin: 5px 0 20px 0;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.company-details p {
  margin: 2px 0;
  font-size: 14px;
  color: #555;
}

.invoice-meta {
  text-align: right;
}

.document-title {
  font-size: 32px;
  font-weight: 900;
  margin: 0 0 10px 0;
  color: #333;
  text-transform: uppercase;
}

.meta-box table {
  float: right;
}

.meta-box td {
  padding: 3px 0 3px 15px;
  text-align: right;
  font-size: 14px;
}

/* Client Section */
.client-section {
  margin-bottom: 40px;
  background-color: #f8fafc;
  border-radius: 8px;
  padding: 20px;
  border-left: 5px solid #03323a; /* Updated Color */
}

.client-box h3 {
  margin: 0 0 10px 0;
  font-size: 12px;
  text-transform: uppercase;
  color: #888;
  letter-spacing: 1px;
}

.client-name {
  font-size: 22px;
  font-weight: 800;
  margin: 0 0 15px 0;
  color: #03323a; /* Updated Color */
}

.client-details p {
  margin: 3px 0;
  font-size: 14px;
  color: #444;
}

/* Items Table */
.items-section {
  margin-bottom: 40px;
}

.items-table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th {
  padding: 12px 10px;
  background-color: #03323a; /* Updated Color */
  color: white;
  font-size: 13px;
  text-transform: uppercase;
  font-weight: 600;
}

.items-table td {
  padding: 12px 10px;
  border-bottom: 1px solid #eee;
  font-size: 14px;
}

.items-table tr:last-child td {
  border-bottom: 2px solid #03323a; /* Updated Color */
}

/* Links */
.pickup-link {
  color: #0ea5e9;
  text-decoration: none;
  font-weight: 500;
}

.pickup-link:hover {
  text-decoration: underline;
}

/* Totals */
.totals-section {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 60px;
}

.totals-box {
  width: 300px;
}

.total-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  font-size: 15px;
}

.total-row.subtotal {
  border-bottom: 1px solid #eee;
  color: #666;
}

.total-row.cod-info {
  border-bottom: 1px solid #eee;
  color: #10b981; /* emerald-500 */
}

.total-row.grand-total {
  font-size: 20px;
  font-weight: 800;
  color: #03323a; /* Updated Color */
  padding: 15px 0;
  border-bottom: 2px solid #03323a; /* Updated Color */
}

.total-row.paid-info,
.total-row.balance-info {
  font-size: 13px;
  color: #888;
}

/* Footer */
.footer {
  text-align: center;
  margin-top: 50px;
  padding-top: 30px;
  border-top: 1px solid #eee;
  color: #888;
}

.loading {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  font-family: sans-serif;
  color: #666;
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
  .no-print-link {
    color: inherit !important;
    text-decoration: none !important;
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
