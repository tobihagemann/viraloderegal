<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { requestJson, useErrorText } from '../../composables/useErrorText.js';
import FormDialog from '../../components/admin/FormDialog.vue';
import SetForm, { type SetRow } from '../../components/admin/SetForm.vue';

const { t } = useI18n();
const resolveError = useErrorText();

const sets = ref<SetRow[]>([]);
const listError = ref<string | null>(null);

const formSet = ref<SetRow | null>(null);
const formOpen = ref(false);

async function loadSets(): Promise<void> {
  listError.value = null;
  const result = await requestJson<{ sets: SetRow[] }>('/api/admin/sets');
  if (!result.ok) {
    listError.value = resolveError(result.code);
    return;
  }
  sets.value = result.data.sets;
}

function newSet(): void {
  formSet.value = null;
  formOpen.value = true;
}

function editSet(set: SetRow): void {
  formSet.value = set;
  formOpen.value = true;
}

function onSaved(): void {
  formOpen.value = false;
}

// Reload on close, not on `saved`: reka-ui unmounts the form before a mid-save dismissal's emit can land.
watch(formOpen, (open) => {
  if (!open) {
    void loadSets();
  }
});

async function deleteSet(set: SetRow): Promise<void> {
  const result = await requestJson(`/api/admin/sets/${set.id}`, { method: 'DELETE' });
  if (!result.ok) {
    listError.value = resolveError(result.code);
    return;
  }
  await loadSets();
}

onMounted(() => {
  void loadSets();
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('adminSets.heading') }}</h1>
      <div class="flex items-center gap-2">
        <RouterLink :to="{ name: 'admin' }" class="btn btn-secondary">{{ t('adminNav.backToAdmin') }}</RouterLink>
        <button type="button" class="btn btn-primary" @click="newSet">
          <PlusIcon class="size-4 shrink-0" />
          {{ t('adminSets.newSet') }}
        </button>
      </div>
    </div>

    <p v-if="listError" class="text-sm text-red-600">{{ listError }}</p>

    <ul role="list" class="flex flex-col divide-y divide-neutral-950/5">
      <li v-for="set in sets" :key="set.id" class="flex items-center justify-between gap-4 py-3 first:pt-0">
        <div class="min-w-0">
          <p class="truncate font-medium text-neutral-900">{{ set.name }}</p>
          <p class="text-xs text-neutral-500">
            {{ t('adminSets.roundCount', { count: set.videoOrder.length }) }} · {{ set.enabled ? t('adminSets.stateEnabled') : t('adminSets.stateDisabled') }} ·
            {{ set.unreadyVideos.length === 0 ? t('adminSets.stateReady') : t('adminSets.stateUnready', { count: set.unreadyVideos.length }) }}
          </p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <button type="button" class="icon-btn icon-btn-accent" :aria-label="t('adminSets.edit')" :title="t('adminSets.edit')" @click="editSet(set)">
            <PencilSquareIcon class="size-4" />
          </button>
          <button type="button" class="icon-btn icon-btn-neutral" :aria-label="t('adminSets.delete')" :title="t('adminSets.delete')" @click="deleteSet(set)">
            <TrashIcon class="size-4" />
          </button>
        </div>
      </li>
      <li v-if="sets.length === 0" class="py-6 text-center text-sm text-neutral-500">{{ t('adminSets.empty') }}</li>
    </ul>

    <FormDialog
      v-model:open="formOpen"
      :title="formSet ? t('adminSets.formEdit') : t('adminSets.formNew')"
      :description="t('adminSets.formHint')"
      width-class="max-w-3xl"
    >
      <SetForm :set="formSet" @saved="onSaved" @close="formOpen = false" />
    </FormDialog>
  </div>
</template>
