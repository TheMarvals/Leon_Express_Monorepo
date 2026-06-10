<template>
  <VaInput v-model="searchValue" class="mb-4" placeholder="Search">
    <template #appendInner>
      <IonIcon name="search-outline" style="color: var(--va-secondary)"></IonIcon>
    </template>
  </VaInput>
  <section v-if="filteredCategories.length" class="grid grid-cols-3 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
    <template v-for="category in filteredCategories" :key="category.id">
      <VaCard class="col-span-3 md:col-span-1 min-h-[146px]" href="#">
        <VaCardContent class="leading-5 text-sm">
          <IonIcon
            :name="`${category.icon}-outline`"
            class="font-light mb-2"
            style="color: var(--va-primary); font-size: 2rem"
          ></IonIcon>
          <h2 class="text-primary mb-2 text-primary text-lg leading-7 font-bold">{{ category.name }}</h2>
          <p>{{ category.intro }}</p>
        </VaCardContent>
      </VaCard>
    </template>
  </section>
  <VaAlert v-else class="mb-4 leading-5" color="info" outline>
    No matches found. Try refining your search or browse through the categories to find the help you need.
  </VaAlert>
</template>

<script lang="ts" setup>
import categories from '../data/popularCategories'
import { ref, computed } from 'vue'

const searchValue = ref('')

const filteredCategories = computed(() => {
  const value = searchValue.value.trim().toLowerCase()
  if (value.length === 0) {
    return categories
  }
  return categories.filter((category) => {
    return category.intro.toLowerCase().includes(value) || category.name.toLowerCase().includes(value)
  })
})
</script>
