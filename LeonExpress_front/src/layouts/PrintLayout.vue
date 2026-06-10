<template>
  <!-- Este layout renderiza SOLO el contenido, sin wrappers externos -->
  <div class="print-layout">
    <RouterView />
  </div>
</template>

<style scoped>
.print-layout {
  width: 100%;
  padding: 0;
  margin: 0;
  background-color: white;
}
</style>
