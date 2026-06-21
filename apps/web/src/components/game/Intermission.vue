<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import { useConnection } from '../../composables/useConnection.js';
import PhaseHeader from './PhaseHeader.vue';

const { isHost } = useGameState();
const { send } = useConnection();
const { t } = useI18n();

function skip(): void {
  send({ type: 'skipIntermission' });
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <PhaseHeader />
    <div class="flex flex-col items-center gap-4 py-10 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('intermission.heading') }}</h1>
      <p class="text-base text-neutral-600">{{ t('intermission.subtitle') }}</p>
      <button v-if="isHost" type="button" class="btn btn-primary mt-2" @click="skip">{{ t('intermission.skip') }}</button>
      <p v-else class="mt-2 text-sm text-neutral-500">{{ t('intermission.waitingForHost') }}</p>
    </div>
  </div>
</template>
