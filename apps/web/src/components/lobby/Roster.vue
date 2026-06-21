<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';

const { store } = useGameState();
const { t } = useI18n();
</script>

<template>
  <ul role="list" class="divide-y divide-neutral-950/5">
    <li v-for="player in store.lobby?.players ?? []" :key="player.id" class="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span
        class="size-2 shrink-0 rounded-full"
        :class="player.connected ? 'bg-emerald-500' : 'bg-neutral-300'"
        :title="player.connected ? '' : t('lobby.disconnected')"
        aria-hidden="true"
      ></span>
      <p class="min-w-0 flex-1 truncate text-base font-medium text-neutral-800">
        {{ player.name }}
        <span v-if="player.id === store.you" class="font-normal text-neutral-400">({{ t('common.you') }})</span>
      </p>
      <span v-if="player.isHost" class="inline-flex shrink-0 items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        {{ t('lobby.hostBadge') }}
      </span>
    </li>
  </ul>
</template>
