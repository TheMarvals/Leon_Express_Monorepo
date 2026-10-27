<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useModal, useToast } from 'vuestic-ui'
import { useUserStore } from '@/stores/user-store'
import api from '@/services/api'
import { MAX_LABEL_NOTES } from '@/components/labels/labelNotes'

const props = defineProps<{ pkg: any }>()
const emit = defineEmits<{ (event: 'saved'): void; (event: 'deleted'): void; (event: 'refresh'): void }>()
const userStore = useUserStore()
const { confirm } = useModal()
const { init: notify } = useToast()
const open = ref(false)
const busy = ref(false)
const error = ref('')
const form = reactive({
  recipient_name: '',
  recipient_phone: '',
  destination_address: '',
  notes: '',
  is_cod: false,
  cod_amount: 0,
  is_change: false,
})
const canManage = computed(
  () =>
    userStore.isClient &&
    props.pkg?.client_id === userStore.user?.client_id &&
    props.pkg?.status === 'PENDIENTE_RECOLECCION' &&
    !props.pkg.external_tracking_code &&
    !props.pkg.sales_codes &&
    !props.pkg.has_multiple_labels &&
    !props.pkg.scanned_at_origin_datetime &&
    !props.pkg.received_at_warehouse_datetime,
)
function edit() {
  error.value = ''
  const address = props.pkg.destination_address || ''
  const notes = address.match(/\s*\(Obs:\s*([\s\S]*)\)\s*$/i)
  Object.assign(form, {
    recipient_name: props.pkg.recipient_name || '',
    recipient_phone: props.pkg.recipient_phone || '',
    destination_address: notes ? address.slice(0, notes.index).trim() : address,
    notes: notes?.[1]?.trim() || '',
    is_cod: !!props.pkg.is_cod,
    cod_amount: Number(props.pkg.cod_amount || 0),
    is_change: !!props.pkg.is_change,
  })
  open.value = true
}
async function save() {
  if (busy.value) return
  if (
    !form.recipient_name.trim() ||
    !form.destination_address.trim() ||
    form.notes.length > MAX_LABEL_NOTES ||
    (form.is_cod && Number(form.cod_amount) <= 0)
  ) {
    error.value = 'Completa el destinatario y la dirección. Revisa el monto de cobro y el límite de observaciones.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    const notes = form.notes.trim()
    await api.updateMyPendingPackage(props.pkg.package_id, {
      recipient_name: form.recipient_name.trim(),
      recipient_phone: form.recipient_phone.trim(),
      destination_address: `${form.destination_address.trim()}${notes ? ` (Obs: ${notes})` : ''}`,
      is_cod: form.is_cod,
      cod_amount: form.is_cod ? Number(form.cod_amount) : 0,
      is_change: form.is_change,
    })
    open.value = false
    notify({ message: 'Envío actualizado. Vuelve a imprimir la etiqueta.', color: 'success' })
    emit('saved')
  } catch (err: any) {
    error.value = err.response?.data?.error || 'No se pudo actualizar el envío.'
    if ([403, 404, 409].includes(err.response?.status)) {
      notify({ message: error.value, color: 'danger' })
      open.value = false
      emit('refresh')
    }
  } finally {
    busy.value = false
  }
}
async function remove() {
  if (busy.value) return
  busy.value = true
  try {
    const accepted = await confirm({
      title: 'Eliminar envío manual',
      message: `Se eliminará el envío ${props.pkg.tracking_code}. Su etiqueta dejará de ser válida.`,
      okText: 'Eliminar envío',
      cancelText: 'Cancelar',
    })
    if (!accepted) return
    await api.deleteMyPendingPackage(props.pkg.package_id)
    notify({ message: 'Envío eliminado.', color: 'success' })
    emit('deleted')
  } catch (err: any) {
    notify({ message: err.response?.data?.error || 'No se pudo eliminar el envío.', color: 'danger' })
    emit('refresh')
  } finally {
    busy.value = false
  }
}
</script>
<template>
  <template v-if="canManage">
    <VaButton
      preset="primary"
      size="small"
      icon="edit"
      title="Editar envío manual"
      aria-label="Editar envío manual"
      :disabled="busy"
      @click="edit"
    />
    <VaButton
      preset="primary"
      size="small"
      icon="delete"
      color="danger"
      title="Eliminar envío manual"
      aria-label="Eliminar envío manual"
      :disabled="busy"
      @click="remove"
    />
    <VaModal v-model="open" title="Editar envío manual" hide-default-actions size="medium" :no-dismiss="busy">
      <form class="edit-client-package" @submit.prevent="save">
        <p>
          Puedes modificar este envío mientras esté pendiente de recolección. Después de guardar, imprime nuevamente su
          etiqueta.
        </p>
        <VaInput
          v-model="form.recipient_name"
          label="Destinatario"
          placeholder="Nombre del destinatario"
          :maxlength="100"
        />
        <VaInput
          v-model="form.recipient_phone"
          label="Teléfono"
          placeholder="Teléfono del destinatario"
          :maxlength="20"
        />
        <VaTextarea
          v-model="form.destination_address"
          label="Dirección y comuna"
          placeholder="Dirección completa, comuna"
          :maxlength="800"
          rows="2"
        />
        <VaTextarea
          v-model="form.notes"
          label="Observaciones"
          placeholder="Observaciones para la entrega"
          :maxlength="MAX_LABEL_NOTES"
          rows="2"
        />
        <div class="flex flex-wrap items-center gap-4">
          <VaCheckbox v-model="form.is_cod" label="Cobro contra entrega" />
          <VaCheckbox v-model="form.is_change" label="¿Es un Cambio? (Retirar producto)" class="font-semibold" />
        </div>
        <VaInput v-if="form.is_cod" v-model.number="form.cod_amount" label="Monto a cobrar ($)" type="number" min="1" />
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <div class="actions">
          <VaButton preset="secondary" :disabled="busy" @click="open = false">Cancelar</VaButton>
          <VaButton
            color="#03323a"
            type="submit"
            :loading="busy"
            :disabled="busy || form.notes.length > MAX_LABEL_NOTES"
            >Guardar cambios</VaButton
          >
        </div>
      </form>
    </VaModal>
  </template>
</template>
<style scoped>
.edit-client-package {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.edit-client-package > p {
  font-size: 13px;
  line-height: 1.6;
  color: #607275;
}
.edit-client-package > .counter {
  text-align: right;
  font-size: 12px;
  margin-top: -8px;
}
.edit-client-package > .form-error {
  color: #a12c1a;
}
.actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}
</style>
