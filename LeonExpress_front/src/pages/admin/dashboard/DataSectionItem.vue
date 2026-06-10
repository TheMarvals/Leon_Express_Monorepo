<template>
  <VaCard>
    <VaCardContent>
      <section>
        <header class="flex items-center justify-start gap-3">
          <div
            class="p-1 rounded flex-shrink-0"
            :style="{
              backgroundColor: iconBackground,
              color: iconColor,
            }"
          >
            <slot name="icon"></slot>
          </div>
          <div class="text-lg font-semibold">{{ value }}</div>
        </header>
        <div>
          <p class="mb-2">{{ title }}</p>
          <p class="text-xs text-secondary">
            <span :class="changeClass">
              <template v-if="up">↑</template>
              <template v-else>↓</template>
              {{ changeText }}
            </span>
            since last month
          </p>
        </div>
      </section>
    </VaCardContent>
  </VaCard>
</template>

<script lang="ts" setup>
import { computed } from 'vue'
import { VaCard } from 'vuestic-ui'

const props = defineProps<{
  title: string
  value: string | number
  changeText: string
  up: boolean
  iconBackground: string
  iconColor: string
}>()

const changeClass = computed(() => ({
  'text-success': props.up,
  'text-red-600': !props.up,
}))
</script>
