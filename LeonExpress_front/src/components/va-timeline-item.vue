<template>
  <tr class="va-timeline-item">
    <td class="va-timeline-item__icon-cell">
      <div class="va-timeline-item__icon" :class="`va-timeline-item__icon--${iconColor}`">
        <VaIcon :name="icon" size="20px" />
      </div>
    </td>
    <td class="va-timeline-item__content-cell">
      <div class="va-timeline-item__content">
        <slot />
      </div>
    </td>
    <td class="va-timeline-item__date-cell">
      <slot name="date">
        {{ $props.date }}
      </slot>
    </td>
  </tr>
</template>

<script setup lang="ts">
defineProps({
  date: {
    type: String,
    default: '',
  },
  icon: {
    type: String,
    default: 'fa4-clock',
  },
  iconColor: {
    type: String,
    default: 'secondary',
  },
})
</script>

<style lang="scss" scoped>
.va-timeline-item {
  display: table-row;

  &__icon-cell {
    vertical-align: top;
    width: 50px;
    padding-right: 1rem;
    padding-bottom: 2rem;
  }

  &__icon {
    width: 32px;
    height: 32px;
    position: relative;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    border-radius: 50%;
    background: var(--va-background-element);
    border: 2px solid var(--va-background-border);
    color: var(--va-secondary);
    margin-bottom: 1rem;

    &--primary {
      background: var(--va-primary);
      border-color: var(--va-primary);
      color: white;
    }

    &--success {
      background: var(--va-success);
      border-color: var(--va-success);
      color: white;
    }

    &--warning {
      background: var(--va-warning);
      border-color: var(--va-warning);
      color: white;
    }

    &--danger {
      background: var(--va-danger);
      border-color: var(--va-danger);
      color: white;
    }

    &--info {
      background: var(--va-info);
      border-color: var(--va-info);
      color: white;
    }

    &::after {
      content: '';
      position: absolute;
      top: 40px;
      left: 50%;
      transform: translateX(-50%);
      width: 2px;
      height: 200px;
      background: var(--va-background-border);
      z-index: -1;
    }
  }

  &__content {
    margin-bottom: 2rem;
    padding: 0.5rem 0;
  }

  &__content-cell {
    width: 100%;
    vertical-align: top;
  }

  &__date-cell {
    vertical-align: top;
    color: var(--va-secondary);
    text-wrap: nowrap;
    white-space: nowrap;
    padding-left: 1rem;
    text-align: end;
    min-width: 120px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  &:last-child {
    .va-timeline-item__icon {
      &::after {
        background: transparent;
      }
    }
  }
}
</style>
