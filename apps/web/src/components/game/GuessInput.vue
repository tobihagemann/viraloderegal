<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MAX_GUESS } from '@viraloderegal/shared';
import { useGameState } from '../../composables/useGameState.js';
import { useConnection } from '../../composables/useConnection.js';
import PhaseHeader from './PhaseHeader.vue';

const { store, setYourGuess } = useGameState();
const { send } = useConnection();
const { t } = useI18n();

const formatter = new Intl.NumberFormat('de-DE');
const MAX_GUESS_DIGITS = String(MAX_GUESS).length;

// The field is live: the latest value is sent as a debounced draft (the server upserts it and rate-limits to
// 5/s), so a value once entered always counts — a round is scored as "kein Tipp" only for a field that was
// never filled in (a value already sent is not retracted by clearing the field). Pressing "Tipp abgeben"
// sends a final guess that marks the player ready; the round skips to the reveal once every player is ready.
// Editing again sends a draft, which un-readies the player.
const digits = ref(store.yourGuess !== null ? String(store.yourGuess) : '');
const submitted = ref(false);
const display = computed(() => (digits.value ? formatter.format(Number(digits.value)) : ''));
const hasGuess = computed(() => digits.value.length > 0);

const statusText = computed(() => (submitted.value ? t('game.submitted') : hasGuess.value ? t('game.readyPrompt') : t('game.guessBlank')));

let draftTimer: ReturnType<typeof setTimeout> | null = null;

function clearDraftTimer(): void {
  if (draftTimer) {
    clearTimeout(draftTimer);
    draftTimer = null;
  }
}

function sendDraft(): void {
  draftTimer = null;
  if (!hasGuess.value) return;
  const value = Number(digits.value);
  setYourGuess(value);
  send({ type: 'guess', value });
}

function onInput(event: Event): void {
  const cleaned = (event.target as HTMLInputElement).value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  // Cap anything at or beyond MAX_GUESS so the value stays a safe integer.
  digits.value = cleaned.length >= MAX_GUESS_DIGITS && Number(cleaned) > MAX_GUESS ? String(MAX_GUESS) : cleaned;
  const wasSubmitted = submitted.value;
  submitted.value = false;
  clearDraftTimer();
  if (wasSubmitted) {
    // Editing after committing must un-ready this player immediately, before a concurrent all-ready check can
    // skip past them with the now-stale committed value.
    sendDraft();
  } else {
    draftTimer = setTimeout(sendDraft, 350);
  }
}

function submit(): void {
  if (!hasGuess.value) return;
  clearDraftTimer();
  const value = Number(digits.value);
  setYourGuess(value);
  submitted.value = true;
  send({ type: 'guess', value, final: true });
}

// Drop a pending draft when the window closes (the component unmounts on the phase change).
onBeforeUnmount(clearDraftTimer);
</script>

<template>
  <div class="flex flex-col gap-6">
    <PhaseHeader />
    <div class="text-center">
      <h1 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{{ t('game.guessHeading') }}</h1>
      <p class="mt-2 text-base text-pretty text-neutral-600">{{ t('game.guessSubtitle') }}</p>
    </div>

    <form class="mx-auto flex w-full max-w-sm flex-col gap-3" @submit.prevent="submit">
      <label for="guess" class="block text-sm font-medium text-neutral-700">{{ t('game.guessLabel') }}</label>
      <input
        id="guess"
        name="guess"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        :value="display"
        :placeholder="t('game.guessPlaceholder')"
        class="field text-right text-lg font-semibold tabular-nums"
        @input="onInput"
      />
      <button type="submit" class="btn btn-primary" :disabled="!hasGuess || submitted">{{ t('game.submitGuess') }}</button>
      <p class="text-center text-sm" :class="submitted ? 'text-emerald-700' : 'text-neutral-500'">{{ statusText }}</p>
    </form>

    <p v-if="submitted" class="text-center text-sm text-neutral-500">{{ t('game.waitingForOthers') }}</p>
  </div>
</template>
