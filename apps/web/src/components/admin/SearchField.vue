<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/16/solid';

defineProps<{ modelValue: string; placeholder?: string }>();
// Enter emits `search` rather than submitting: this field renders inside an outer form, where a native submit
// would save that form.
defineEmits<{ 'update:modelValue': [value: string]; search: [] }>();
</script>

<template>
  <div class="relative w-full">
    <MagnifyingGlassIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
    <input
      :value="modelValue"
      name="search"
      type="search"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="field pl-9"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="$emit('search')"
    />
  </div>
</template>
