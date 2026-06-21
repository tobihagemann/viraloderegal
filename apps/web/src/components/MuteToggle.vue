<script setup lang="ts">
import { computed } from 'vue';
import { SwitchRoot, SwitchThumb } from 'reka-ui';
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
    <svg viewBox="0 0 16 16" class="size-4 shrink-0 fill-current text-neutral-500" aria-hidden="true">
      <template v-if="soundOn">
        <path
          d="M7.557 2.066A.75.75 0 0 1 8 2.75v10.5a.75.75 0 0 1-1.248.56L3.59 11H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.59l3.162-2.81a.75.75 0 0 1 .805-.124ZM12.95 3.05a.75.75 0 1 0-1.06 1.06 5.5 5.5 0 0 1 0 7.78.75.75 0 1 0 1.06 1.06 7 7 0 0 0 0-9.9Z"
        />
        <path d="M10.828 5.172a.75.75 0 1 0-1.06 1.06 2.5 2.5 0 0 1 0 3.536.75.75 0 1 0 1.06 1.06 4 4 0 0 0 0-5.656Z" />
      </template>
      <path
        v-else
        d="M7.557 2.066A.75.75 0 0 1 8 2.75v10.5a.75.75 0 0 1-1.248.56L3.59 11H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1.59l3.162-2.81a.75.75 0 0 1 .805-.124ZM11.28 5.72a.75.75 0 1 0-1.06 1.06L11.44 8l-1.22 1.22a.75.75 0 1 0 1.06 1.06l1.22-1.22 1.22 1.22a.75.75 0 1 0 1.06-1.06L13.56 8l1.22-1.22a.75.75 0 0 0-1.06-1.06L12.5 6.94l-1.22-1.22Z"
      />
    </svg>
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
