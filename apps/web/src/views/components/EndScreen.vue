<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import HostSettings from '../../components/lobby/HostSettings.vue';
import StandingRow from '../../components/reveal/StandingRow.vue';

const { store, isHost } = useGameState();
const { t } = useI18n();

const formatter = new Intl.NumberFormat('de-DE');
const format = (value: number): string => formatter.format(value);

const leaders = computed(() => store.standings.filter((standing) => standing.rank === 1));
const winnerText = computed(() => (leaders.value.length === 1 ? t('end.winner', { name: leaders.value[0]?.playerName ?? '' }) : t('end.winnerTie')));

// Each round's winner names, taken straight from the server's per-round scores (no client recompute).
function winners(results: { playerName: string; isWinner: boolean }[]): string {
  return results
    .filter((result) => result.isWinner)
    .map((result) => result.playerName)
    .join(', ');
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="text-center">
      <p class="text-sm font-medium text-neutral-500">{{ t('end.heading') }}</p>
      <h1 class="mt-1 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{{ winnerText }}</h1>
    </div>

    <div class="flex flex-col gap-3">
      <h2 class="text-base font-semibold">{{ t('end.finalStanding') }}</h2>
      <ul role="list" class="flex flex-col gap-2">
        <StandingRow v-for="standing in store.standings" :key="standing.playerName" :standing="standing" />
      </ul>
    </div>

    <div v-if="store.roundsHistory.length > 0" class="flex flex-col gap-3">
      <h2 class="text-base font-semibold">{{ t('end.roundsHeading') }}</h2>
      <div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6">
        <div class="inline-block min-w-full px-4 py-2 align-middle sm:px-6">
          <table class="w-full text-left">
            <thead>
              <tr class="border-b border-neutral-950/10">
                <th class="py-2 pr-3 text-sm font-medium whitespace-nowrap text-neutral-500">{{ t('end.round') }}</th>
                <th class="px-3 py-2 text-sm font-medium whitespace-nowrap text-neutral-500">{{ t('end.video') }}</th>
                <th class="px-3 py-2 text-sm font-medium whitespace-nowrap text-neutral-500">{{ t('reveal.viewCount') }}</th>
                <th class="py-2 pl-3 text-sm font-medium whitespace-nowrap text-neutral-500">{{ t('reveal.winner') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="round in store.roundsHistory" :key="round.roundNo" class="border-b border-neutral-950/5">
                <td class="py-2.5 pr-3 text-sm whitespace-nowrap text-neutral-700 tabular-nums">{{ t('end.roundLabelShort', { round: round.roundNo }) }}</td>
                <td class="px-3 py-2.5 text-sm text-neutral-700">
                  <span class="block max-w-[12rem] truncate" :title="round.title ?? undefined">{{ round.title ?? '—' }}</span>
                </td>
                <td class="px-3 py-2.5 text-sm whitespace-nowrap text-neutral-900 tabular-nums">{{ format(round.viewCount) }}</td>
                <td class="py-2.5 pl-3 text-sm whitespace-nowrap text-neutral-700">{{ winners(round.results) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <HostSettings v-if="isHost" :start-label="t('end.rematch')" />
    <p v-else class="text-center text-sm text-neutral-500">{{ t('end.waitingForHost') }}</p>
  </div>
</template>
