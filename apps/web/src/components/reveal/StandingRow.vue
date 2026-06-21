<script setup lang="ts">
import type { Standing } from '@viraloderegal/shared';

defineProps<{ standing: Standing }>();
</script>

<template>
  <li class="flex items-center gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
    <span
      class="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
      :class="standing.rank === 1 ? 'bg-red-600 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-950/10'"
    >
      {{ standing.rank }}
    </span>
    <p class="min-w-0 flex-1 truncate text-base font-medium text-neutral-900">{{ standing.playerName }}</p>
    <p class="shrink-0 text-base font-semibold text-neutral-700 tabular-nums">{{ standing.totalPoints }}</p>
  </li>
</template>
