<script setup lang="ts">
import { computed } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { useMute } from '../composables/useMute.js';

const muted = useMute();
const { t } = useI18n();

// The switch reads as "sound on": checked means audible, so flipping it sets the shared mute flag.
const soundOn = computed({
  get: () => !muted.value,
  set: (value: boolean) => {
    muted.value = !value;
  },
});
</script>

<template>
  <div class="flex items-center gap-2">
    <SpeakerWaveIcon v-if="soundOn" class="size-4 shrink-0 text-neutral-500" />
    <SpeakerXMarkIcon v-else class="size-4 shrink-0 text-neutral-500" />
    <SwitchRoot
      v-model="soundOn"
      :aria-label="soundOn ? t('mute.mute') : t('mute.unmute')"
      class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full bg-neutral-200 p-0.5 outline-red-600 outline-offset-2 transition-colors duration-200 focus-visible:outline-2 data-[state=checked]:bg-red-600"
    >
      <SwitchThumb
        class="aspect-square h-full rounded-full bg-white shadow-xs ring-1 ring-neutral-900/5 transition-transform duration-200 data-[state=checked]:translate-x-full"
      />
    </SwitchRoot>
  </div>
</template>
