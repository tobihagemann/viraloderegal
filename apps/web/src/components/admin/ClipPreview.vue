<script setup lang="ts">
import { ref } from 'vue';
import { useYouTube } from '../../composables/useYouTube.js';

// The admin "Clip testen" preview: the same inline IFrame player the game uses, mounted on demand so the
// admin can confirm the chosen segment plays. Remount (via :key on the call site) to preview new parameters.
const props = defineProps<{ videoId: string; startSec: number; endSec: number }>();

const container = ref<HTMLElement | null>(null);
useYouTube({ container, videoId: props.videoId, startSec: props.startSec, endSec: props.endSec });
</script>

<template>
  <div class="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-900 ring-1 ring-neutral-950/10">
    <div ref="container" class="absolute inset-0"></div>
  </div>
</template>
