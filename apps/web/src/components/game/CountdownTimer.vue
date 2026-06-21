<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ phaseEndAt: string }>();
const { t } = useI18n();

// The deadline is server-authoritative; this only renders remaining time derived from it, never its own clock.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

function stop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

watch(
  () => props.phaseEndAt,
  () => {
    stop();
    now.value = Date.now();
    timer = setInterval(() => {
      now.value = Date.now();
    }, 250);
  },
  { immediate: true },
);

onUnmounted(stop);

const remaining = computed(() => Math.max(0, Math.ceil((new Date(props.phaseEndAt).getTime() - now.value) / 1000)));
const urgent = computed(() => remaining.value <= 5);
</script>

<template>
  <div class="inline-flex items-baseline gap-1 rounded-full px-3 py-1" :class="urgent ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-600'">
    <span class="text-lg font-semibold tabular-nums">{{ remaining }}</span>
    <span class="text-xs font-medium">{{ t('common.seconds') }}</span>
  </div>
</template>
