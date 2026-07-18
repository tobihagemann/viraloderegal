<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useGameState } from '../composables/useGameState.js';
import { useConnection } from '../composables/useConnection.js';
import { clearSessionToken, readSessionToken } from '../composables/useStorage.js';
import { useErrorText } from '../composables/useErrorText.js';
import LobbyScreen from '../components/lobby/LobbyScreen.vue';
import ClipStage from '../components/game/ClipStage.vue';
import GuessInput from '../components/game/GuessInput.vue';
import Intermission from '../components/game/Intermission.vue';
import RevealGuesses from '../components/reveal/RevealGuesses.vue';
import Leaderboard from '../components/reveal/Leaderboard.vue';
import EndScreen from './components/EndScreen.vue';
import CleanupBanner from '../components/CleanupBanner.vue';

const props = defineProps<{ code: string }>();
const router = useRouter();
const { t } = useI18n();
const resolveError = useErrorText();
const { store, viewMode, clearError } = useGameState();
const { status, connect, disconnect } = useConnection();

const code = computed(() => props.code.toUpperCase());

onMounted(() => {
  const token = readSessionToken(code.value);
  if (!token) {
    void router.replace({ name: 'home' });
    return;
  }
  connect(code.value, token);
});

onUnmounted(() => disconnect());

// A removal is terminal: drop the now-useless token so a future visit starts a clean join.
watch(
  () => store.kicked,
  (reason) => {
    if (reason) {
      clearSessionToken(code.value);
    }
  },
);

// A terminal token rejection (the room was cleaned up, or the IP is banned) leaves nothing to render here:
// drop the dead token and return to the home screen with the reason shown, rather than stranding the user.
watch(
  () => store.terminated,
  (reason) => {
    if (reason) {
      clearSessionToken(code.value);
      void router.replace({ name: 'home', query: { error: reason } });
    }
  },
);

// Transient errors (rejected guess, not-host) surface as a toast that clears itself.
let toastTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => store.lastError,
  (error) => {
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    if (error) {
      toastTimer = setTimeout(clearError, 4000);
    }
  },
);
onUnmounted(() => {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
});

const kickedMessage = computed(() => (store.kicked === 'ban' ? resolveError('banned') : resolveError('kicked')));
const errorMessage = computed(() => (store.lastError ? resolveError(store.lastError.code) : null));

function leave(): void {
  void router.push({ name: 'home' });
}
</script>

<template>
  <div class="flex w-full flex-1 flex-col">
    <p v-if="status === 'reconnecting'" class="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800 ring-1 ring-amber-600/20">
      {{ t('connection.reconnecting') }}
    </p>

    <div v-if="store.kicked" class="mx-auto flex max-w-md flex-col items-center gap-4 pt-8 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">{{ kickedMessage }}</h1>
      <button type="button" class="btn btn-primary" @click="leave">{{ t('common.back') }}</button>
    </div>

    <template v-else>
      <CleanupBanner v-if="store.roomWarning !== null" :seconds-remaining="store.roomWarning" />

      <LobbyScreen v-if="viewMode === 'lobby'" />
      <EndScreen v-else-if="viewMode === 'end'" />
      <template v-else>
        <ClipStage v-if="store.phase === 'prepare' || store.phase === 'clip'" :key="store.round?.roundId" />
        <GuessInput v-else-if="store.phase === 'guess'" />
        <RevealGuesses v-else-if="store.phase === 'reveal_guesses'" />
        <Leaderboard v-else-if="store.phase === 'reveal_board'" />
        <Intermission v-else-if="store.phase === 'inter'" />
      </template>
    </template>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div v-if="errorMessage" class="fixed inset-x-0 bottom-4 z-20 mx-auto w-fit max-w-[calc(100%---spacing(8))] px-4">
        <p class="rounded-lg bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg">{{ errorMessage }}</p>
      </div>
    </Transition>
  </div>
</template>
