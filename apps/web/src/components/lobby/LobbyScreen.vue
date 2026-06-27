<script setup lang="ts">
import { ref } from 'vue';
import { CheckIcon, ClipboardIcon, ExclamationTriangleIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import { useMute } from '../../composables/useMute.js';
import Roster from './Roster.vue';
import RenameField from './RenameField.vue';
import HostSettings from './HostSettings.vue';

const { store, isHost } = useGameState();
const { t } = useI18n();
const muted = useMute();

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

function enableSound(): void {
  muted.value = false;
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

    <div v-if="muted" class="flex flex-col gap-3 rounded-lg bg-amber-50 p-4 ring-1 ring-amber-600/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div class="flex items-start gap-2.5">
        <ExclamationTriangleIcon class="mt-0.5 size-4 shrink-0 text-amber-500" />
        <p class="min-w-0 text-sm text-pretty text-amber-800">{{ t('sound.offHint') }}</p>
      </div>
      <button type="button" class="btn btn-secondary shrink-0" @click="enableSound">{{ t('sound.enable') }}</button>
    </div>

    <RenameField />

    <HostSettings v-if="isHost" />
    <p v-else class="text-center text-sm text-neutral-500">{{ t('lobby.waitingForHostStart') }}</p>
  </div>
</template>
