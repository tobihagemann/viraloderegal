<script setup lang="ts">
import { SelectContent, SelectItem, SelectItemIndicator, SelectItemText, SelectPortal, SelectRoot, SelectTrigger, SelectValue, SelectViewport } from 'reka-ui';

defineProps<{ modelValue: string; options: { value: string; label: string }[]; label: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <SelectRoot :model-value="modelValue" @update:model-value="$emit('update:modelValue', String($event))">
    <SelectTrigger :aria-label="label" class="field flex items-center justify-between gap-2 text-left">
      <SelectValue />
      <svg viewBox="0 0 8 5" width="8" height="5" fill="none" class="shrink-0" aria-hidden="true">
        <path d="M.5.5 4 4 7.5.5" class="stroke-neutral-500" />
      </svg>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent
        position="popper"
        :side-offset="6"
        class="z-30 max-h-60 min-w-(--reka-select-trigger-width) overflow-hidden rounded-lg bg-white p-1 shadow-lg ring-1 ring-neutral-950/10"
      >
        <SelectViewport>
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-neutral-700 select-none data-highlighted:bg-neutral-100 data-highlighted:outline-none data-[state=checked]:font-semibold data-[state=checked]:text-neutral-900"
          >
            <SelectItemText>{{ option.label }}</SelectItemText>
            <SelectItemIndicator>
              <svg viewBox="0 0 14 14" width="14" height="14" fill="none" class="size-3.5 shrink-0" aria-hidden="true">
                <path d="M3 8L6 11L11 3.5" class="stroke-red-600" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </SelectItemIndicator>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>
