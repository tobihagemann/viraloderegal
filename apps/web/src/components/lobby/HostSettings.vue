<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { DEFAULT_GUESS_TIMER_SEC, DEFAULT_ROUNDS_TOTAL, GUESS_TIMER_OPTIONS_SEC, ROUNDS_TOTAL_OPTIONS, gameSettingsSchema } from '@viraloderegal/shared';
import { useGameState } from '../../composables/useGameState.js';
import { useConnection } from '../../composables/useConnection.js';
import SettingsSelect from './SettingsSelect.vue';

// The end screen reuses this start path for a rematch, only relabeling the action.
const props = defineProps<{ startLabel?: string }>();

const { store } = useGameState();
const { send } = useConnection();
const { t } = useI18n();

const startLabel = computed(() => props.startLabel ?? t('settings.start'));

const rounds = ref(String(DEFAULT_ROUNDS_TOTAL));
const timer = ref(String(DEFAULT_GUESS_TIMER_SEC));

const roundOptions = ROUNDS_TOTAL_OPTIONS.map((value) => ({ value: String(value), label: String(value) }));
const timerOptions = GUESS_TIMER_OPTIONS_SEC.map((value) => ({ value: String(value), label: `${value} ${t('common.seconds')}` }));

// Phase 1 only supports the random source; the server rejects any other with invalid_source.
const canStart = computed(() => store.lobby?.canStart ?? false);

function start(): void {
  if (!canStart.value) return;
  const settings = gameSettingsSchema.parse({
    source: 'random',
    roundsTotal: Number(rounds.value),
    guessTimerSec: Number(timer.value),
  });
  send({ type: 'start', settings });
}
</script>

<template>
  <div class="card flex flex-col gap-5">
    <h2 class="text-base font-semibold">{{ t('settings.heading') }}</h2>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="flex flex-col gap-1.5">
        <p class="text-sm font-medium text-neutral-700">{{ t('settings.rounds') }}</p>
        <SettingsSelect v-model="rounds" :options="roundOptions" :label="t('settings.rounds')" />
      </div>
      <div class="flex flex-col gap-1.5">
        <p class="text-sm font-medium text-neutral-700">{{ t('settings.timer') }}</p>
        <SettingsSelect v-model="timer" :options="timerOptions" :label="t('settings.timer')" />
      </div>
      <div class="flex flex-col gap-1.5">
        <p class="text-sm font-medium text-neutral-700">{{ t('settings.source') }}</p>
        <p class="flex items-center rounded-lg bg-neutral-50 px-3 py-2.5 text-base text-neutral-500 sm:py-2 sm:text-sm">{{ t('settings.sourceRandom') }}</p>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <button type="button" class="btn btn-primary w-full sm:w-auto sm:self-start" :disabled="!canStart" @click="start">{{ startLabel }}</button>
      <p v-if="!canStart" class="text-sm text-neutral-500">{{ t('lobby.needMorePlayers') }}</p>
    </div>
  </div>
</template>
