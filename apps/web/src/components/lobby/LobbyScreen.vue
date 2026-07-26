<script setup lang="ts">
import { ref } from 'vue';
import { CheckIcon, ClipboardIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import Roster from './Roster.vue';
import SoundHint from './SoundHint.vue';
import HostSettings from './HostSettings.vue';

const { store, isHost } = useGameState();
const { t } = useI18n();

const copied = ref(false);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

async function copyCode(): Promise<void> {
  const code = store.lobby?.code;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    copied.value = true;
    if (copiedTimer) {
      clearTimeout(copiedTimer);
    }
    copiedTimer = setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    // ignore: clipboard may be unavailable; the code stays visible to copy by hand
  }
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="card flex flex-col items-center gap-3 text-center">
      <p class="text-sm font-medium text-neutral-500">{{ t('lobby.roomCode') }}</p>
      <p class="text-4xl font-semibold tracking-[0.25em] text-neutral-900 tabular-nums">{{ store.lobby?.code }}</p>
      <button type="button" class="btn btn-secondary" @click="copyCode">
        <CheckIcon v-if="copied" class="size-4 shrink-0" />
        <ClipboardIcon v-else class="size-4 shrink-0" />
        {{ copied ? t('lobby.copied') : t('lobby.copyCode') }}
      </button>
    </div>

    <div class="card flex flex-col gap-4">
      <div class="flex items-baseline justify-between gap-3">
        <h2 class="text-base font-semibold">{{ t('lobby.players') }}</h2>
        <p class="text-sm text-neutral-500 tabular-nums">{{ store.lobby?.players.length ?? 0 }}</p>
      </div>
      <Roster />
    </div>

    <SoundHint />

    <HostSettings v-if="isHost" />
    <p v-else class="text-center text-sm text-neutral-500">{{ t('lobby.waitingForHostStart') }}</p>
  </div>
</template>
