<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { PlayIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { REVEAL_GUESSES_SEC } from '@viraloderegal/shared';
import { useGameState } from '../../composables/useGameState.js';
import { STING_NOTE_TIMES_MS, STING_TOTAL_MS, useSting } from '../../composables/useSting.js';
import PhaseHeader from '../game/PhaseHeader.vue';

const { store } = useGameState();
const { t } = useI18n();
const { play, warm } = useSting();

const formatter = new Intl.NumberFormat('de-DE');
const format = (value: number): string => formatter.format(value);

// The guess list stays invisible (but space-reserving) until the sting's final note so a quick reader
// cannot back-derive the view count from a guess and its shown distance early.
const SUSPENSE_MS = 3000;
// The notes open with a soft attack and low-frequency energy, so their perceived onset trails the scheduled
// start — while a transform step is visible on its first frame. Delay each visual step by this much so the
// pop lands on the note as heard, not as scheduled.
const AUDIO_LEAD_MS = 50;
const STEP_CLASSES = ['scale-50 opacity-0', 'scale-75 opacity-50', 'scale-85 opacity-75', 'scale-100 opacity-100'] as const;
const step = ref(0);
const grow = computed(() => step.value > 0);
const timers: ReturnType<typeof setTimeout>[] = [];

// The deadline is server-authoritative (mirrors CountdownTimer): a mount close to the phase start is a live
// reveal and gets the full choreography; a later mount is a mid-phase (re)join and skips to the settled
// state silently.
const elapsedMs = REVEAL_GUESSES_SEC * 1000 - (new Date(store.phaseEndAt ?? '').getTime() - Date.now());
if (Number.isFinite(elapsedMs) && elapsedMs < SUSPENSE_MS + Math.max(...STING_NOTE_TIMES_MS)) {
  warm();
  timers.push(setTimeout(play, SUSPENSE_MS));
  STING_NOTE_TIMES_MS.forEach((noteMs, i) => timers.push(setTimeout(() => (step.value = i + 1), SUSPENSE_MS + AUDIO_LEAD_MS + noteMs)));
} else {
  step.value = STING_NOTE_TIMES_MS.length;
}
onUnmounted(() => timers.forEach(clearTimeout));

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
      <p class="text-sm font-medium text-neutral-500">{{ step === 0 ? t('reveal.sting') : t('reveal.viewCount') }}</p>
      <div class="relative mt-1">
        <!-- aria-hidden mirrors the visual reveal: opacity alone would leave the answer readable to screen readers during the suspense. -->
        <p
          class="text-4xl font-semibold tracking-tight tabular-nums transition-transform ease-[cubic-bezier(0.33,1,0.68,1)] sm:text-5xl"
          :class="grow ? 'scale-100' : 'scale-50'"
          :style="{ transitionDuration: `${STING_TOTAL_MS}ms` }"
          :aria-hidden="step === 0 ? 'true' : undefined"
        >
          <span class="inline-block transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]" :class="STEP_CLASSES[step]">
            {{ format(store.reveal?.viewCount ?? 0) }}
          </span>
        </p>
        <div
          class="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-300"
          :class="step === 0 ? 'opacity-100' : 'opacity-0'"
          aria-hidden="true"
        >
          <span class="size-3 animate-bounce rounded-full bg-red-600 [animation-delay:-300ms]"></span>
          <span class="size-3 animate-bounce rounded-full bg-red-600 [animation-delay:-150ms]"></span>
          <span class="size-3 animate-bounce rounded-full bg-red-600"></span>
        </div>
      </div>
    </div>

    <ul
      role="list"
      class="flex flex-col gap-1.5 transition-opacity duration-300"
      :class="step === STING_NOTE_TIMES_MS.length ? 'opacity-100' : 'opacity-0'"
      :aria-hidden="step < STING_NOTE_TIMES_MS.length ? 'true' : undefined"
    >
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
