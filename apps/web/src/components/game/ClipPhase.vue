<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import { useConnection } from '../../composables/useConnection.js';
import { useYouTube } from '../../composables/useYouTube.js';
import PhaseHeader from './PhaseHeader.vue';

const { store, isHost } = useGameState();
const { send } = useConnection();
const { t } = useI18n();

// The round is fixed for this mount: ClipPhase remounts each round, so capturing it here is stable.
const round = store.round;
const container = ref<HTMLElement | null>(null);
let reported = false;

// Only the host swaps a broken clip, and only once: a duplicate report is a server no-op, but guarding here
// avoids a needless second frame.
function reportFailure(): void {
  if (!isHost.value || reported || !round) return;
  reported = true;
  send({ type: 'reportClipFailure', roundId: round.roundId });
}

useYouTube({
  container,
  videoId: round?.youtubeId ?? '',
  startSec: round?.clipStartSec ?? 0,
  endSec: round?.clipEndSec ?? 0,
  onClipError: reportFailure,
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <PhaseHeader />
    <div class="text-center">
      <h1 class="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{{ t('game.clipHeading') }}</h1>
      <p class="mt-2 text-base text-pretty text-neutral-600">{{ t('game.clipSubtitle') }}</p>
    </div>
    <div class="clip-frame relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-neutral-950/10">
      <div ref="container" class="absolute inset-0"></div>
    </div>
  </div>
</template>
