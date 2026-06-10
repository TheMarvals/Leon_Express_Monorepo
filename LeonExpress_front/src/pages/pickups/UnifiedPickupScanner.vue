<template>
  <!-- Loading -->
  <div v-if="isLoading" class="flex justify-center p-8">
    <VaProgressCircle indeterminate />
  </div>

  <!-- Error -->
  <div v-else-if="error" class="p-4 text-center">
    <VaIcon name="error_outline" size="3rem" color="danger" />
    <p class="text-lg mt-2">{{ error }}</p>
    <VaButton class="mt-4" @click="router.back()">Volver</VaButton>
  </div>

  <!-- Main UI -->
  <div v-else class="pb-4 max-w-lg mx-auto">
    <div class="px-4 pt-4">
      <!-- Título de página e info -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h1 class="page-title mb-0.5">Escanear Paquetes</h1>
          <p class="text-xs text-gray-500">{{ pickup?.client?.client_name }}</p>
        </div>

        <!-- Contador rápido -->
        <div class="flex items-center gap-2 text-xs">
          <div
            v-if="confirmedML.length > 0"
            class="flex items-center gap-1 bg-green-50 text-green-700 px-2.5 py-1.5 rounded-full font-medium"
          >
            <VaIcon name="check_circle" size="0.85rem" />
            <span>{{ confirmedML.length }} ML</span>
          </div>
          <div
            v-if="capturedPhotos.length > 0"
            class="flex items-center gap-1 bg-orange-50 text-orange-700 px-2.5 py-1.5 rounded-full font-medium"
          >
            <VaIcon name="photo_camera" size="0.85rem" />
            <span>{{ capturedPhotos.length }} Fotos</span>
          </div>
          <div
            v-if="pendingPhotoCodes.length > 0"
            class="flex items-center gap-1 bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-full font-medium"
          >
            <VaIcon name="schedule" size="0.85rem" />
            <span>{{ pendingPhotoCodes.length }} Pend.</span>
          </div>
        </div>
      </div>
      <!-- ===== MODO ESCÁNER QR ===== -->
      <template v-if="!photoModeActive && !uploadComplete">
        <!-- Panel de Control del Escáner (cuando la cámara no está activa) -->
        <div
          v-if="!isQRCameraActive"
          class="bg-gradient-to-br from-slate-50 to-slate-100 rounded-3xl p-6 border border-slate-200/60 shadow-sm mb-4 text-center"
        >
          <div
            class="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-inner"
          >
            <VaIcon name="qr_code_scanner" size="2.5rem" />
          </div>
          <h2 class="text-xl font-extrabold text-slate-800 mb-1">Escáner de Paquetes</h2>
          <p class="text-xs text-slate-500 max-w-xs mx-auto mb-6">
            Escanear el código QR/Barras del paquete para confirmarlo o tomar una foto de la etiqueta para procesarla
            con Inteligencia Artificial.
          </p>

          <div class="grid grid-cols-1 gap-3">
            <!-- Botón Iniciar Cámara QR -->
            <button
              class="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 active:from-teal-700 active:to-emerald-800 text-white font-bold text-base py-4 px-6 rounded-2xl shadow-md shadow-emerald-500/10 transition-all duration-150 active:scale-[0.98]"
              @click="startQRCamera"
            >
              <VaIcon name="photo_camera" size="1.3rem" />
              <span>Escanear QR / Código de Barras</span>
            </button>

            <!-- Botón Ingreso Manual -->
            <button
              class="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-sm py-3 px-6 rounded-xl transition-all duration-150"
              @click="showManualInput = !showManualInput"
            >
              <VaIcon name="keyboard" size="1.1rem" />
              <span>{{ showManualInput ? 'Ocultar Ingreso Manual' : 'Ingreso Manual de Código' }}</span>
            </button>
          </div>
        </div>

        <!-- Panel de Ingreso Manual -->
        <Transition name="slide-up">
          <div
            v-if="showManualInput && !isQRCameraActive"
            class="bg-white rounded-2xl p-5 border border-gray-150 shadow-sm mb-4"
          >
            <h3 class="font-bold text-gray-800 text-base mb-3 flex items-center gap-2">
              <span>⌨️</span> Ingresar Código Manualmente
            </h3>
            <div class="flex gap-3">
              <VaInput
                v-model="manualTrackingCode"
                placeholder="Ej: 46000123456"
                class="flex-1"
                @keyup.enter="submitManualCode"
              />
              <VaButton color="primary" :disabled="!manualTrackingCode.trim()" @click="submitManualCode">
                Buscar
              </VaButton>
            </div>
          </div>
        </Transition>

        <!-- Card de la cámara QR (solo visible cuando está activa) -->
        <div v-show="isQRCameraActive" class="bg-gray-900 rounded-2xl overflow-hidden shadow-lg mb-3 relative">
          <RoutePackageScanner
            ref="qrScannerRef"
            hide-controls
            emit-only
            @rawScan="handleQRScanned"
            @rawQrData="handleRawQRData"
            @cameraStatus="(active) => (isQRCameraActive = active)"
          />

          <!-- Feedback overlay -->
          <Transition name="feedback">
            <div
              v-if="lastScanFeedback"
              class="absolute inset-0 flex items-center justify-center z-30 pointer-events-none backdrop-brightness-75"
            >
              <div
                :class="[
                  'text-center px-6 py-5 rounded-2xl shadow-2xl transform scale-in pointer-events-auto',
                  lastScanFeedback.type === 'success' ? 'bg-green-600/95 text-white' : 'bg-orange-600/95 text-white',
                ]"
              >
                <VaIcon :name="lastScanFeedback.icon" size="3.5rem" />
                <p class="font-bold text-xl mt-2">{{ lastScanFeedback.title }}</p>
                <p v-if="lastScanFeedback.subtitle" class="text-sm mt-1 opacity-90">{{ lastScanFeedback.subtitle }}</p>

                <!-- Botón de acción rápido si requiere foto -->
                <div v-if="lastScanFeedback.type === 'warning'" class="mt-4 flex flex-col gap-2 w-full">
                  <button
                    class="flex items-center justify-center gap-2 mx-auto px-5 py-2.5 bg-white text-orange-700 hover:bg-orange-50 font-bold text-sm rounded-xl shadow-md transition-all duration-150 active:scale-95 pointer-events-auto w-full"
                    @click="handleFeedbackTakePhoto"
                  >
                    <VaIcon name="photo_camera" size="1.1rem" />
                    <span>Tomar Foto Ahora</span>
                  </button>
                </div>
              </div>
            </div>
          </Transition>
        </div>

        <!-- Mensaje contextual (solo visible cuando la cámara está activa) -->
        <div v-if="isQRCameraActive" class="text-center mb-4">
          <p class="text-sm text-gray-500">
            <template v-if="!pendingNonMLCode"> Apunta la cámara al código QR de la etiqueta </template>
            <template v-else>
              <span class="text-orange-600 font-medium">Código leído: {{ pendingNonMLCode }}</span>
            </template>
          </p>
        </div>

        <!-- Botones de acción principales -->
        <div class="space-y-3">
          <!-- Si la cámara QR está activa y tenemos un código pendiente de foto, mostrar acceso directo destacado -->
          <button
            v-if="isQRCameraActive && pendingNonMLCode"
            class="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold text-base py-3.5 px-6 rounded-2xl shadow-lg transition-all duration-150 active:scale-[0.98]"
            @click="handleFeedbackTakePhoto"
          >
            <VaIcon name="photo_camera" size="1.3rem" />
            <span>Tomar Foto de este Paquete</span>
          </button>

          <!-- Botón "Detener Cámara QR" - solo visible si está activa la cámara QR -->
          <button
            v-if="isQRCameraActive"
            class="w-full flex items-center justify-center gap-2 bg-red-500 hover:bg-red-650 text-white font-semibold text-base py-3.5 px-6 rounded-2xl shadow-lg transition-all duration-150 active:scale-[0.98]"
            @click="stopQRCamera"
          >
            <VaIcon name="videocam_off" size="1.3rem" />
            <span>Detener Cámara QR</span>
          </button>

          <!-- Cola de paquetes (resumen) -->
          <div
            v-if="
              (confirmedML.length > 0 || capturedPhotos.length > 0 || pendingPhotoCodes.length > 0) && !isQRCameraActive
            "
            class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
          >
            <div class="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <span class="font-semibold text-gray-700 text-sm">Resumen de Escaneo</span>
            </div>
            <div class="px-4 py-3 space-y-2 text-sm">
              <div v-if="confirmedML.length > 0" class="flex items-center gap-2 text-green-700">
                <VaIcon name="check_circle" size="1rem" />
                <span>{{ confirmedML.length }} paquete(s) ML confirmados</span>
              </div>
              <div v-if="capturedPhotos.length > 0" class="flex items-center gap-2 text-blue-700">
                <VaIcon name="photo_camera" size="1rem" />
                <span>{{ capturedPhotos.length }} foto(s) tomadas</span>
              </div>
              <div v-if="pendingPhotoCodes.length > 0" class="flex items-center gap-2 text-amber-600">
                <VaIcon name="schedule" size="1rem" />
                <span>{{ pendingPhotoCodes.length }} pendiente(s) de foto</span>
              </div>
            </div>

            <!-- Galería de fotos en miniatura -->
            <div v-if="capturedPhotos.length > 0" class="px-4 pb-3">
              <div class="grid grid-cols-6 gap-1.5">
                <div
                  v-for="(photo, index) in capturedPhotos"
                  :key="index"
                  class="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group"
                >
                  <img :src="photo" class="w-full h-full object-cover" loading="lazy" />
                  <button
                    class="absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center rounded-full bg-red-500/90 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    @click="removePhoto(index)"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Botón "Terminar Recolección" - visible cuando hay algo procesado -->
          <button
            v-if="(confirmedML.length > 0 || capturedPhotos.length > 0) && !isQRCameraActive"
            :disabled="isUploading"
            class="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 active:from-green-700 active:to-emerald-800 text-white font-bold text-base py-4 px-6 rounded-2xl shadow-lg shadow-green-600/25 transition-all duration-150 active:scale-[0.98] disabled:opacity-50"
            @click="finishCollection"
          >
            <VaIcon :name="isUploading ? 'hourglass_top' : 'check_circle'" size="1.3rem" />
            <span>{{
              isUploading ? 'Procesando...' : `Terminar Recolección (${confirmedML.length + capturedPhotos.length})`
            }}</span>
          </button>

          <!-- Upload progress bar -->
          <div v-if="isUploading && uploadProgress > 0" class="w-full">
            <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                class="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all duration-300"
                :style="{ width: `${uploadProgress}%` }"
              />
            </div>
            <p class="text-xs text-gray-500 text-center mt-1">Subiendo fotos... {{ uploadProgress }}%</p>
          </div>

          <!-- Botón "Volver" secundario -->
          <button
            class="w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 font-medium text-sm py-3 px-6 rounded-xl transition-all duration-150"
            @click="goBack"
          >
            <VaIcon name="arrow_back" size="1rem" />
            <span>Volver a la recolección</span>
          </button>
        </div>
      </template>

      <!-- ===== MODO FOTO (OCR) ===== -->
      <template v-if="photoModeActive && !uploadComplete">
        <!-- Cámara para fotos -->
        <div class="bg-gray-900 rounded-2xl overflow-hidden shadow-lg mb-3">
          <div class="relative bg-black min-h-[280px] flex items-center justify-center">
            <video ref="video" class="w-full h-auto max-h-[50vh] object-contain" autoplay playsinline muted />
            <!-- Overlay semitransparente cuando no hay stream -->
            <div
              v-if="!cameraStream && !isProcessing"
              class="absolute inset-0 flex flex-col items-center justify-center text-gray-400"
            >
              <VaIcon name="videocam_off" size="3rem" />
              <p class="mt-2 text-sm">Iniciando cámara...</p>
            </div>

            <!-- Upload progress overlay -->
            <div v-if="isUploading" class="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20">
              <VaProgressCircle indeterminate size="large" color="white" />
              <p class="text-white mt-3 font-medium">Subiendo fotos...</p>
              <div v-if="uploadProgress > 0" class="w-2/3 mt-3">
                <div class="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                  <div
                    class="bg-gradient-to-r from-blue-500 to-cyan-400 h-2.5 rounded-full transition-all duration-300"
                    :style="{ width: `${uploadProgress}%` }"
                  />
                </div>
                <p class="text-white/70 text-xs text-center mt-1">{{ uploadProgress }}%</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Controles de foto -->
        <div class="flex flex-col items-center justify-center gap-4 mb-4">
          <!-- Botones estilo cámara nativa -->
          <div class="w-full flex items-center justify-center max-w-sm px-4">
            <!-- Botón Central: Obturador Circular Premium -->
            <div class="flex flex-col items-center">
              <button
                :disabled="isProcessing || isUploading || capturedPhotos.length >= 300"
                class="group relative flex items-center justify-center w-20 h-20 rounded-full border-4 border-white bg-transparent shadow-xl transition-all duration-150 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                aria-label="Tomar Foto"
                @click="takePhoto"
              >
                <!-- Círculo interior obturador -->
                <span
                  class="block w-14 h-14 rounded-full bg-blue-600 group-hover:bg-blue-700 transition-colors duration-150"
                  :class="isProcessing ? 'animate-pulse bg-blue-400' : ''"
                />
                <!-- Icono de cámara dentro -->
                <VaIcon v-if="!isProcessing" name="photo_camera" size="1.5rem" color="white" class="absolute" />
                <VaProgressCircle v-else indeterminate size="small" color="white" class="absolute" />
              </button>
              <span class="text-[11px] font-bold text-gray-600 mt-1 uppercase tracking-wider">
                {{ isProcessing ? 'Procesando...' : 'Capturar' }}
              </span>
            </div>
          </div>

          <!-- Botón Volver -->
          <button
            class="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 font-medium text-sm py-2.5 transition-colors"
            @click="goBack"
          >
            <VaIcon name="arrow_back" size="0.9rem" />
            <span>Volver a la recolección</span>
          </button>
        </div>

        <!-- Galería de fotos tomadas -->
        <Transition name="slide-up">
          <div
            v-if="capturedPhotos.length > 0"
            class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-3"
          >
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div class="flex items-center gap-2">
                <VaIcon name="photo_library" size="1.2rem" color="#6b7280" />
                <span class="font-semibold text-gray-700 text-sm">Fotos tomadas</span>
                <span class="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">{{
                  capturedPhotos.length
                }}</span>
              </div>
              <button
                :disabled="isUploading"
                class="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                @click="clearPhotos"
              >
                Limpiar todo
              </button>
            </div>

            <div class="grid grid-cols-4 gap-2 p-3">
              <div
                v-for="(photo, index) in capturedPhotos"
                :key="index"
                class="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 group"
              >
                <img :src="photo" class="w-full h-full object-cover" loading="lazy" />
                <!-- Delete button -->
                <button
                  :disabled="isUploading"
                  class="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-red-500/90 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-30"
                  @click="removePhoto(index)"
                >
                  ✕
                </button>
                <!-- Index badge -->
                <div
                  class="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                >
                  {{ index + 1 }}
                </div>
              </div>
            </div>

            <!-- Botón volver al escáner -->
            <div class="px-4 pb-4">
              <button
                class="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-600 hover:to-emerald-700 text-white font-bold text-base py-3.5 px-6 rounded-xl shadow-lg transition-all duration-150 active:scale-[0.98]"
                @click="switchToQRMode"
              >
                <VaIcon name="qr_code_scanner" size="1.2rem" />
                <span>Volver al Escáner ({{ capturedPhotos.length }} foto(s) en cola)</span>
              </button>
            </div>
          </div>
        </Transition>
      </template>

      <!-- ===== PANTALLA DE COMPLETADO ===== -->
      <template v-if="uploadComplete">
        <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
          <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5 animate-bounce-in">
            <VaIcon name="check_circle" size="3.5rem" color="#22c55e" />
          </div>
          <h2 class="text-2xl font-bold text-gray-900 mb-2">¡Listo!</h2>
          <p class="text-gray-500 mb-6 max-w-xs">
            <template v-if="confirmedML.length > 0 && capturedPhotos.length > 0">
              <strong>{{ confirmedML.length }}</strong> ML confirmados y
              <strong>{{ capturedPhotos.length }}</strong> foto(s) enviadas a procesar.
            </template>
            <template v-else-if="confirmedML.length > 0">
              <strong>{{ confirmedML.length }}</strong> paquete(s) ML confirmados exitosamente.
            </template>
            <template v-else>
              <strong>{{ capturedPhotos.length }}</strong> foto(s) enviadas a procesar.
            </template>
          </p>
          <button
            class="w-full max-w-xs flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3.5 px-6 rounded-2xl shadow-lg transition-all duration-150 active:scale-[0.98]"
            @click="goBack"
          >
            <VaIcon name="arrow_back" size="1.1rem" />
            <span>Volver a la recolección</span>
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useToast } from 'vuestic-ui'
import api, { axiosInstance } from '../../services/api'
import { uploadBatchChunked } from '../../composables/useChunkedUpload'
import { Pickup } from './types'
import RoutePackageScanner from '../routes/widgets/RoutePackageScanner.vue'

const route = useRoute()
const router = useRouter()
const { init: notifyRaw } = useToast()

// Control de notificaciones: solo una a la vez
let lastNotifyClose: (() => void) | null = null
function notify(opts: { message: string; color?: string; duration?: number }) {
  if (lastNotifyClose) {
    try {
      lastNotifyClose()
    } catch (e) {
      // Ignorar error al cerrar toast
    }
    lastNotifyClose = null
  }
  lastNotifyClose = notifyRaw({ message: opts.message, color: opts.color || 'info', duration: opts.duration || 3000 })
  setTimeout(
    () => {
      lastNotifyClose = null
    },
    (opts.duration || 3000) + 200,
  )
}

const pickupId = route.params.id as string
const pickup = ref<Pickup | null>(null)
const isLoading = ref(true)
const error = ref('')

// ─── Scanner QR ────────────────────────────────────────────
const qrScannerRef = ref<InstanceType<typeof RoutePackageScanner> | null>(null)
let pendingRawQRData: string | null = null
const pendingNonMLCode = ref<string | null>(null)
const isQRCameraActive = ref(false)
const pendingPhotoCodes = ref<string[]>([])
const showManualInput = ref(false)
const manualTrackingCode = ref('')

function startQRCamera() {
  qrScannerRef.value?.startCamera()
}

function stopQRCamera() {
  qrScannerRef.value?.stopCamera()
}

async function submitManualCode() {
  if (!manualTrackingCode.value.trim()) return
  const code = manualTrackingCode.value.trim()
  manualTrackingCode.value = ''
  showManualInput.value = false
  await handleQRScanned(code)
}

// ─── Confirmados ML ────────────────────────────────────────
interface ConfirmedML {
  tracking: string
  recipient: string
  timestamp: Date
}
const confirmedML = ref<ConfirmedML[]>([])

// ─── Último feedback visual ───────────────────────────────
const lastScanFeedback = ref<{
  type: string
  icon: string
  color: string
  title: string
  subtitle?: string
} | null>(null)

let feedbackTimeout: ReturnType<typeof setTimeout> | null = null
function showFeedback(type: 'success' | 'warning', icon: string, color: string, title: string, subtitle?: string) {
  if (feedbackTimeout) clearTimeout(feedbackTimeout)
  lastScanFeedback.value = { type, icon, color, title, subtitle }
  if (type === 'warning') return // warnings are persistent - user must choose action
  feedbackTimeout = setTimeout(() => {
    lastScanFeedback.value = null
  }, 2500)
}

// ─── Modo foto (OCR) ──────────────────────────────────────
const photoModeActive = ref(false)
const video = ref<HTMLVideoElement | null>(null)
let cameraStream: MediaStream | null = null

const capturedPhotos = ref<string[]>([])
const isProcessing = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)
const uploadComplete = ref(false)
// Pricing
const clientPrice = ref(0)
const deliveryCost = ref(0)

// ─── Lifecycle ──────────────────────────────────────────────

onMounted(async () => {
  try {
    const { data } = await api.getPickupById(pickupId)
    pickup.value = data

    // Load client price
    try {
      const pricingRes = await api.getClientPricing(data.client_id)
      clientPrice.value = parseFloat(pricingRes.data?.base_price) || 0
    } catch (e) {
      console.warn('No se pudo cargar precio del cliente:', e)
    }

    // Load delivery cost
    try {
      const vehicle = data?.user?.vehicles?.[0]?.vehicleType
      if (vehicle?.base_delivery_cost) {
        deliveryCost.value = parseFloat(vehicle.base_delivery_cost)
      }
    } catch (e) {
      console.warn('No se pudo cargar costo de entrega:', e)
    }
  } catch (e) {
    error.value = 'Error al cargar datos de la recolección.'
    console.error(e)
  } finally {
    isLoading.value = false
  }
})

onBeforeUnmount(() => {
  stopPhotoCamera()
})

// ─── QR detectado ──────────────────────────────────────────

function handleRawQRData(data: string) {
  pendingRawQRData = data
}

async function handleQRScanned(code: string) {
  if (!code) return

  pendingNonMLCode.value = null

  // Evitar duplicados
  if (confirmedML.value.some((c) => c.tracking === code)) {
    notify({ message: `Código ${code} ya fue procesado`, color: 'info', duration: 1500 })
    return
  }

  // Detectar si es código ML (Chilean formats: starts with 4 (11 digits), 3 (10-11 digits), or 2 (12-16 digits))
  const cleanCode = code.replace(/[\s-]/g, '')
  const isML = /^(4\d{10}|3\d{9,10}|2\d{11,15})$/.test(cleanCode)

  if (isML) {
    await tryConfirmML(code)
  } else {
    // No es ML → sugerir tomar foto
    pendingNonMLCode.value = code
    showFeedback(
      'warning',
      'photo_camera',
      '#ff9800',
      'Necesitas tomar una foto',
      'Este código no es de MercadoLibre. Presiona "Tomar Foto"',
    )
  }
}

async function tryConfirmML(code: string) {
  try {
    const res = await axiosInstance.post('/ml-confirm/packages/confirm-ml', {
      pickup_id: pickupId,
      ml_code: code,
      raw_qr_data: pendingRawQRData,
    })

    // ✅ ML vinculado — confirmado
    confirmedML.value.push({
      tracking: code,
      recipient: res.data.package?.recipient_name || res.data.package?.address || '—',
      timestamp: new Date(),
    })

    showFeedback('success', 'check_circle', '#4caf50', 'ML Confirmado', res.data.package?.address || code)

    if ('vibrate' in navigator) navigator.vibrate(100)
  } catch (e: any) {
    const errMsg = e.response?.data?.error || ''

    if (/no vinculada|no vinculado|not.*link/i.test(errMsg)) {
      // ❌ ML pero cuenta no vinculada → sugerir foto + OCR
      pendingNonMLCode.value = code
      showFeedback(
        'warning',
        'photo_camera',
        '#ff9800',
        'Necesitas tomar una foto',
        'Cuenta ML no vinculada. Presiona "Tomar Foto"',
      )
    } else if (/ya fue.*importado|already.*import|duplicado/i.test(errMsg)) {
      confirmedML.value.push({
        tracking: code,
        recipient: 'Ya importado',
        timestamp: new Date(),
      })
      showFeedback('success', 'check_circle', '#4caf50', 'Ya confirmado', code)
    } else {
      showFeedback('warning', 'warning', '#ff9800', 'Error', errMsg || 'Intenta con foto')
      notify({ message: errMsg || 'Error al confirmar ML. Toma una foto.', color: 'danger', duration: 3000 })
    }
  }
}

// ─── Cambiar entre modo QR y modo foto ─────────────────────

function switchToPhotoMode() {
  photoModeActive.value = true
  if (qrScannerRef.value) {
    qrScannerRef.value.stopCamera()
  }
  nextTick(() => startPhotoCamera())
}

function handleFeedbackTakePhoto() {
  const code = pendingNonMLCode.value
  lastScanFeedback.value = null
  if (code && !pendingPhotoCodes.value.includes(code)) {
    pendingPhotoCodes.value.push(code)
  }
  pendingNonMLCode.value = null
  switchToPhotoMode()
}

function switchToQRMode() {
  photoModeActive.value = false
  stopPhotoCamera()
  pendingNonMLCode.value = null
  nextTick(() => {
    qrScannerRef.value?.startCamera()
  })
}

// ─── Cámara para tomar fotos ──────────────────────────────

async function startPhotoCamera() {
  if (cameraStream) return

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      notify({ message: 'Cámara no soportada.', color: 'danger' })
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
    } catch {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    }

    cameraStream = stream
    await nextTick()

    let attempts = 0
    while (attempts < 30 && !video.value) {
      await new Promise((r) => setTimeout(r, 100))
      attempts++
    }

    if (video.value) {
      video.value.srcObject = stream
      await video.value.play()
    }
  } catch (e: any) {
    console.error('Camera error:', e)
    notify({ message: 'No se pudo activar la cámara.', color: 'danger' })
  }
}

function stopPhotoCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop())
    cameraStream = null
  }
  if (video.value) {
    video.value.srcObject = null
  }
}

async function takePhoto() {
  if (!video.value || !cameraStream || isProcessing.value) return
  isProcessing.value = true

  try {
    const canvas = document.createElement('canvas')
    canvas.width = video.value.videoWidth
    canvas.height = video.value.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.drawImage(video.value, 0, 0)

    let finalCanvas = canvas
    const MAX_WIDTH = 1920
    if (canvas.width > MAX_WIDTH) {
      const ratio = MAX_WIDTH / canvas.width
      finalCanvas = document.createElement('canvas')
      finalCanvas.width = MAX_WIDTH
      finalCanvas.height = Math.round(canvas.height * ratio)
      const fCtx = finalCanvas.getContext('2d')
      if (fCtx) {
        fCtx.imageSmoothingEnabled = true
        fCtx.imageSmoothingQuality = 'high'
        fCtx.drawImage(canvas, 0, 0, finalCanvas.width, finalCanvas.height)
      }
    }

    const base64 = finalCanvas.toDataURL('image/jpeg', 0.8)
    capturedPhotos.value.push(base64)

    if ('vibrate' in navigator) navigator.vibrate(50)

    notify({
      message: `Foto ${capturedPhotos.value.length} tomada`,
      color: 'success',
      duration: 1500,
    })

    // Auto-return to QR scanner after taking the photo
    nextTick(() => switchToQRMode())
  } finally {
    isProcessing.value = false
  }
}

function removePhoto(index: number) {
  capturedPhotos.value = capturedPhotos.value.filter((_, i) => i !== index)
}

function clearPhotos() {
  capturedPhotos.value = []
}
// ─── Finalizar recolección (fotos + ML) ──────────────────

async function finishCollection() {
  // If there are photos, upload them first
  if (capturedPhotos.value.length > 0) {
    isUploading.value = true
    uploadProgress.value = 0
    try {
      await uploadBatchChunked({
        pickupId,
        images: [...capturedPhotos.value],
        clientPrice: clientPrice.value,
        deliveryCost: deliveryCost.value,
        onProgress: (sent, total) => {
          uploadProgress.value = Math.round((sent / total) * 100)
        },
      })
      notify({
        message: `${capturedPhotos.value.length} foto(s) enviadas a OCR`,
        color: 'success',
        duration: 3000,
      })
    } catch (e: any) {
      notify({
        message: e?.response?.data?.error || e?.message || 'Error al subir fotos',
        color: 'danger',
        duration: 5000,
      })
      isUploading.value = false
      return // Don't complete if upload failed
    } finally {
      isUploading.value = false
    }
  }

  uploadComplete.value = true
  stopPhotoCamera()
}

// ─── Navigation ────────────────────────────────────────────

function goBack() {
  stopPhotoCamera()
  router.push({ name: 'pickup-details', params: { id: pickupId } })
}
</script>

<style scoped>
/* Ocultar controles nativos del video */
video::-webkit-media-controls {
  display: none !important;
}

/* Feedback overlay animations */
.feedback-enter-active {
  animation: scaleIn 0.25s ease-out;
}
.feedback-leave-active {
  animation: scaleOut 0.2s ease-in;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes scaleOut {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.85);
  }
}

/* Slide up animation for photo gallery */
.slide-up-enter-active {
  animation: slideUp 0.3s ease-out;
}
.slide-up-leave-active {
  animation: slideDown 0.2s ease-in;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes slideDown {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(20px);
  }
}

/* Bounce animation for completion icon */
.animate-bounce-in {
  animation: bounceIn 0.5s cubic-bezier(0.68, -0.55, 0.27, 1.55);
}

@keyframes bounceIn {
  0% {
    opacity: 0;
    transform: scale(0.3);
  }
  50% {
    opacity: 0.9;
    transform: scale(1.1);
  }
  80% {
    transform: scale(0.95);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
