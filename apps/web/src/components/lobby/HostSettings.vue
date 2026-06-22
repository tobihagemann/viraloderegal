<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  type CuratedSetSummary,
  DEFAULT_GUESS_TIMER_SEC,
  DEFAULT_ROUNDS_TOTAL,
  GUESS_TIMER_OPTIONS_SEC,
  ROUNDS_TOTAL_OPTIONS,
  gameSettingsSchema,
} from '@viraloderegal/shared';
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
// The source select carries 'random' or a curated set's id. Sets come from the public, enabled-and-ready list.
const source = ref('random');
const sets = ref<CuratedSetSummary[]>([]);

const roundOptions = ROUNDS_TOTAL_OPTIONS.map((value) => ({ value: String(value), label: String(value) }));
const timerOptions = GUESS_TIMER_OPTIONS_SEC.map((value) => ({ value: String(value), label: `${value} ${t('common.seconds')}` }));
const sourceOptions = computed(() => [
  { value: 'random', label: t('settings.sourceRandom') },
  ...sets.value.map((set) => ({ value: set.id, label: set.name })),
]);
const isSet = computed(() => source.value !== 'random');

const canStart = computed(() => store.lobby?.canStart ?? false);

onMounted(async () => {
  try {
    const res = await fetch('/api/sets');
    if (res.ok) {
      sets.value = (await res.json()) as CuratedSetSummary[];
    }
  } catch {
    // A failed set fetch leaves the random pool available; the host just sees no curated options.
  }
});

function start(): void {
  if (!canStart.value) return;
  // A set start sends a placeholder roundsTotal (required by the schema); the server derives the real round
  // count from the set length. A random start sends the chosen round count and no set id.
  const settings = gameSettingsSchema.parse(
    isSet.value
      ? { source: 'set', curatedSetId: source.value, roundsTotal: DEFAULT_ROUNDS_TOTAL, guessTimerSec: Number(timer.value) }
      : { source: 'random', roundsTotal: Number(rounds.value), guessTimerSec: Number(timer.value) },
  );
  send({ type: 'start', settings });
}
</script>

<template>
  <div class="card flex flex-col gap-5">
    <h2 class="text-base font-semibold">{{ t('settings.heading') }}</h2>

    <div class="grid gap-4 sm:grid-cols-3">
      <div class="flex flex-col gap-1.5">
        <p class="text-sm font-medium text-neutral-700">{{ t('settings.source') }}</p>
        <SettingsSelect v-model="source" :options="sourceOptions" :label="t('settings.source')" />
      </div>
      <div v-if="!isSet" class="flex flex-col gap-1.5">
        <p class="text-sm font-medium text-neutral-700">{{ t('settings.rounds') }}</p>
        <SettingsSelect v-model="rounds" :options="roundOptions" :label="t('settings.rounds')" />
      </div>
      <div class="flex flex-col gap-1.5">
        <p class="text-sm font-medium text-neutral-700">{{ t('settings.timer') }}</p>
        <SettingsSelect v-model="timer" :options="timerOptions" :label="t('settings.timer')" />
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <button type="button" class="btn btn-primary w-full sm:w-auto sm:self-start" :disabled="!canStart" @click="start">{{ startLabel }}</button>
      <p v-if="!canStart" class="text-sm text-neutral-500">{{ t('lobby.needMorePlayers') }}</p>
    </div>
  </div>
</template>
