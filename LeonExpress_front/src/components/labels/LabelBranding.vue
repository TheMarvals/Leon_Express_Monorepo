<script setup lang="ts">
import logo from '@/assets/leon-express-print.svg'
defineProps<{ clientLogo?: string | null; clientName?: string }>()
</script>
<template>
  <div class="label-branding">
    <img :src="logo" alt="León Express" class="carrier-logo" />
    <img v-if="clientLogo" :src="clientLogo" :alt="clientName || 'Logo del cliente'" class="client-logo" />
    <span v-else class="label-type">ETIQUETA<br />DE ENVÍO</span>
  </div>
</template>
<style scoped>
.label-branding {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 4mm;
  height: 15mm;
}
.label-branding img {
  display: block;
  width: 36mm;
  height: 15mm;
  object-fit: contain;
}
.carrier-logo {
  object-position: left center;
}
.client-logo {
  object-position: right center;
}
.label-type {
  font-family: Arial, Helvetica, sans-serif;
  font-size: 7pt;
  font-weight: 700;
  text-align: right;
  line-height: 1.3;
  color: black;
}
</style>
