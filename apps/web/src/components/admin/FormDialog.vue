<script setup lang="ts">
import { XMarkIcon } from '@heroicons/vue/16/solid';
import { DialogClose, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useI18n } from 'vue-i18n';

withDefaults(defineProps<{ open: boolean; title: string; description: string; widthClass?: string }>(), { widthClass: 'max-w-xl' });
defineEmits<{ 'update:open': [value: boolean] }>();

const { t } = useI18n();
</script>

<template>
  <DialogRoot :open="open" @update:open="$emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-40 bg-neutral-950/40" />
      <DialogContent
        class="fixed inset-4 z-50 m-auto h-fit max-h-full overflow-y-auto rounded-xl bg-white p-5 shadow-lg ring-1 ring-neutral-950/10 sm:p-6"
        :class="widthClass"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <DialogTitle class="text-lg font-medium">{{ title }}</DialogTitle>
            <DialogDescription class="mt-1 text-sm text-neutral-600">{{ description }}</DialogDescription>
          </div>
          <DialogClose class="icon-btn icon-btn-neutral shrink-0" :aria-label="t('common.close')">
            <XMarkIcon class="size-4" />
          </DialogClose>
        </div>
        <div class="mt-5">
          <slot />
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
