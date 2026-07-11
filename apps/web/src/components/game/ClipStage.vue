<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useGameState } from '../../composables/useGameState.js';
import { useConnection } from '../../composables/useConnection.js';
import { useYouTube } from '../../composables/useYouTube.js';
import PhaseHeader from './PhaseHeader.vue';

const { store, isHost } = useGameState();
const { send } = useConnection();
const { t } = useI18n();

// The round is fixed for this mount: ClipStage is keyed by roundId, so it remounts each round while staying
// mounted across the prepare→clip transition. Capturing the round here is stable for the whole segment.
const round = store.round;
const container = ref<HTMLElement | null>(null);
let reported = false;

// Only the host swaps a broken clip, and only once: a duplicate report is a server no-op, but guarding here
// avoids a needless second frame. The player cues during prepare, so an embed error can surface then too.
function reportFailure(): void {
  if (!isHost.value || reported || !round) return;
  reported = true;
  send({ type: 'reportClipFailure', roundId: round.roundId });
}

// Pre-buffer the clip muted-and-hidden during prepare (warming the video segment and audio track), then at
// the clip phase seek to the exact clip start and play so every client sees the identical segment. `playing`
// latches once playback resumes past the brief seek re-prime, gating the overlay so it stays hidden.
const { play, playing } = useYouTube({
  container,
  videoId: round?.youtubeId ?? '',
  startSec: round?.clipStartSec ?? 0,
  endSec: round?.clipEndSec ?? 0,
  prebuffer: true,
  onClipError: reportFailure,
});

// Start the clip when the clip phase begins. `immediate` also covers reconnecting straight into the clip
// phase (play() early-returns until the player is ready, then onReady plays it).
watch(
  () => store.phase,
  (phase) => {
    if (phase === 'clip') {
      play();
    }
  },
  { immediate: true },
);
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
      <!-- Opaque get-ready overlay: the hidden pre-roll plays the video (whose frame/title are part of the
           answer) behind it, so it must fully cover the frame until the clip is truly playing — held past the
           countdown until `playing` latches so the seek re-prime at the clip start stays hidden. -->
      <div v-if="!playing" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900 text-center text-white">
        <p class="text-lg font-semibold sm:text-xl">{{ t('game.prepareHeading') }}</p>
        <p class="text-sm text-white/70">{{ t('game.prepareSubtitle') }}</p>
      </div>
    </div>
  </div>
</template>
