<script setup lang="ts">
import { computed } from 'vue';
import { PlayIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import PhaseHeader from '../game/PhaseHeader.vue';

const { store } = useGameState();
const { t } = useI18n();

const formatter = new Intl.NumberFormat('de-DE');
const format = (value: number): string => formatter.format(value);

// Display ordering only: closest first, non-submitters last. Winner flag and points stay server-computed.
const results = computed(() =>
  [...(store.reveal?.results ?? [])].sort((a, b) => {
    if (a.distance === null) return b.distance === null ? 0 : 1;
    if (b.distance === null) return -1;
    return a.distance - b.distance;
  }),
);
</script>

<template>
  <div class="flex flex-col gap-6">
    <PhaseHeader />

    <div class="text-center">
      <div v-if="store.reveal?.title" class="mb-5 flex items-center justify-center gap-2">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-md bg-red-600 text-white">
          <PlayIcon class="size-4" />
        </span>
        <p class="text-lg font-semibold text-balance text-neutral-900 sm:text-xl">{{ store.reveal.title }}</p>
      </div>
      <p class="text-sm font-medium text-neutral-500">{{ t('reveal.viewCount') }}</p>
      <p class="mt-1 text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">{{ format(store.reveal?.viewCount ?? 0) }}</p>
    </div>

    <ul role="list" class="flex flex-col gap-1.5">
      <li
        v-for="result in results"
        :key="result.playerName"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5"
        :class="result.isWinner ? 'bg-red-50 ring-1 ring-red-600/15' : 'bg-neutral-50'"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate text-base font-medium text-neutral-900">{{ result.playerName }}</p>
          <p class="text-sm text-neutral-500 tabular-nums">
            <template v-if="result.guess !== null">
              {{ t('reveal.yourGuess') }}: {{ format(result.guess) }} · {{ t('reveal.distance') }}: {{ format(result.distance ?? 0) }}
            </template>
            <template v-else>{{ t('reveal.noGuess') }}</template>
          </p>
        </div>
        <span v-if="result.isWinner" class="inline-flex shrink-0 items-center rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
          {{ t('reveal.winner') }}
        </span>
        <p v-if="result.points > 0" class="shrink-0 text-sm font-semibold text-neutral-700 tabular-nums">+{{ result.points }}</p>
      </li>
    </ul>
  </div>
</template>
