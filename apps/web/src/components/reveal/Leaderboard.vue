<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import PhaseHeader from '../game/PhaseHeader.vue';
import StandingRow from './StandingRow.vue';

const { store } = useGameState();
const { t } = useI18n();
</script>

<template>
  <div class="flex flex-col gap-6">
    <PhaseHeader />
    <h1 class="text-center text-2xl font-semibold tracking-tight">{{ t('leaderboard.heading') }}</h1>

    <TransitionGroup tag="ul" role="list" name="board" class="flex flex-col gap-2">
      <StandingRow v-for="standing in store.standings" :key="standing.playerName" :standing="standing" />
    </TransitionGroup>
  </div>
</template>
