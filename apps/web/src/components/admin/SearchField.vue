<script setup lang="ts">
import { MagnifyingGlassIcon } from '@heroicons/vue/16/solid';

defineProps<{ modelValue: string; placeholder?: string }>();
defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
  <div class="relative w-full">
    <MagnifyingGlassIcon class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
    <input
      :value="modelValue"
      type="search"
      :placeholder="placeholder"
      class="field pl-9"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
