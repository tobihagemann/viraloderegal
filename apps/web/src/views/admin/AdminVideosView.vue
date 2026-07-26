<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowPathIcon, PencilSquareIcon, PlusIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { requestJson, useErrorText } from '../../composables/useErrorText.js';
import FormDialog from '../../components/admin/FormDialog.vue';
import SearchField from '../../components/admin/SearchField.vue';
import VideoForm, { type VideoRow } from '../../components/admin/VideoForm.vue';

const PAGE_SIZE = 20;

const { t } = useI18n();
const resolveError = useErrorText();

const videos = ref<VideoRow[]>([]);
const total = ref(0);
const page = ref(1);
const search = ref('');
const quotaExhausted = ref(false);
const listError = ref<string | null>(null);

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / PAGE_SIZE)));

const formVideo = ref<VideoRow | null>(null);
const formOpen = ref(false);

async function loadVideos(): Promise<void> {
  listError.value = null;
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(PAGE_SIZE) });
  if (search.value.trim()) {
    params.set('q', search.value.trim());
  }
  const result = await requestJson<{ videos: VideoRow[]; total: number }>(`/api/admin/videos?${params.toString()}`);
  if (!result.ok) {
    listError.value = resolveError(result.code);
    return;
  }
  videos.value = result.data.videos;
  total.value = result.data.total;
}

async function loadStatus(): Promise<void> {
  const result = await requestJson<{ quotaExhausted: boolean }>('/api/admin/videos/status');
  if (result.ok) {
    quotaExhausted.value = result.data.quotaExhausted;
  }
  // A missing status read is non-fatal; the banner just stays hidden.
}

function runSearch(): void {
  page.value = 1;
  void loadVideos();
}

function goToPage(next: number): void {
  page.value = Math.min(pageCount.value, Math.max(1, next));
  void loadVideos();
}

function newVideo(): void {
  formVideo.value = null;
  formOpen.value = true;
}

function editVideo(video: VideoRow): void {
  formVideo.value = video;
  formOpen.value = true;
}

function onSaved(): void {
  formOpen.value = false;
}

// Reload on close, not on `saved`: reka-ui unmounts the form before a mid-save dismissal's emit can land.
watch(formOpen, (open) => {
  if (!open) {
    void Promise.all([loadVideos(), loadStatus()]);
  }
});

async function refreshVideo(video: VideoRow): Promise<void> {
  const result = await requestJson(`/api/admin/videos/${video.youtubeId}/refresh`, { method: 'POST' });
  if (!result.ok) {
    // Returning here keeps the message on screen: loadVideos() clears listError before its first await.
    listError.value = resolveError(result.code);
    return;
  }
  await Promise.all([loadVideos(), loadStatus()]);
}

onMounted(() => {
  void loadVideos();
  void loadStatus();
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('adminVideos.heading') }}</h1>
      <div class="flex items-center gap-2">
        <RouterLink :to="{ name: 'admin' }" class="btn btn-secondary">{{ t('adminNav.backToAdmin') }}</RouterLink>
        <button type="button" class="btn btn-primary" @click="newVideo">
          <PlusIcon class="size-4 shrink-0" />
          {{ t('adminVideos.newVideo') }}
        </button>
      </div>
    </div>

    <p v-if="quotaExhausted" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">{{ t('adminVideos.quotaBanner') }}</p>

    <div class="flex flex-col gap-3 sm:flex-row">
      <SearchField v-model="search" :placeholder="t('adminVideos.searchPlaceholder')" @search="runSearch" />
      <button type="button" class="btn btn-secondary sm:w-auto" @click="runSearch">{{ t('adminVideos.search') }}</button>
    </div>

    <p v-if="listError" class="text-sm text-red-600">{{ listError }}</p>

    <div class="-mx-4 -my-2 overflow-x-auto sm:-mx-6">
      <div class="inline-block min-w-full px-4 py-2 align-middle sm:px-6">
        <table class="w-full text-left text-sm">
          <thead class="text-neutral-500">
            <tr>
              <th class="py-2 pr-3 font-medium whitespace-nowrap">{{ t('adminVideos.colVideo') }}</th>
              <th class="py-2 pr-3 font-medium whitespace-nowrap">{{ t('adminVideos.colClip') }}</th>
              <th class="py-2 pr-3 font-medium whitespace-nowrap">{{ t('adminVideos.colViews') }}</th>
              <th class="py-2 pr-3 font-medium whitespace-nowrap">{{ t('adminVideos.colFlags') }}</th>
              <th class="py-2">
                <span class="sr-only">{{ t('adminVideos.colActions') }}</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-neutral-950/5">
            <tr v-for="video in videos" :key="video.youtubeId" class="align-top">
              <td class="py-2 pr-3">
                <p class="font-medium text-neutral-900">{{ video.title ?? video.youtubeId }}</p>
                <p class="text-xs text-neutral-500">{{ video.channel ?? '—' }} · {{ video.youtubeId }}</p>
              </td>
              <td class="py-2 pr-3 whitespace-nowrap tabular-nums">{{ video.clipStartSec }}–{{ video.clipEndSec }} {{ t('common.seconds') }}</td>
              <td class="py-2 pr-3 whitespace-nowrap tabular-nums">{{ video.viewCount !== null ? video.viewCount.toLocaleString('de-DE') : '—' }}</td>
              <td class="py-2 pr-3">
                <p class="text-xs text-neutral-500">
                  <template v-if="!video.enabled">{{ t('adminVideos.flagDisabled') }}</template>
                  <template v-else-if="!video.randomEligible">{{ t('adminVideos.flagSetOnly') }}</template>
                  <template v-else>{{ t('adminVideos.flagPool') }}</template>
                </p>
              </td>
              <td class="py-2 whitespace-nowrap text-right">
                <div class="inline-flex items-center gap-1">
                  <button
                    type="button"
                    class="icon-btn icon-btn-accent"
                    :aria-label="t('adminVideos.edit')"
                    :title="t('adminVideos.edit')"
                    @click="editVideo(video)"
                  >
                    <PencilSquareIcon class="size-4" />
                  </button>
                  <button
                    type="button"
                    class="icon-btn icon-btn-neutral"
                    :aria-label="t('adminVideos.refresh')"
                    :title="t('adminVideos.refresh')"
                    @click="refreshVideo(video)"
                  >
                    <ArrowPathIcon class="size-4" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="videos.length === 0">
              <td colspan="5" class="py-6 text-center text-sm text-neutral-500">{{ t('adminVideos.empty') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="flex items-center justify-between text-sm text-neutral-600">
      <button type="button" class="btn btn-secondary" :disabled="page <= 1" @click="goToPage(page - 1)">{{ t('adminVideos.prev') }}</button>
      <p class="tabular-nums max-sm:hidden">{{ t('adminVideos.pageInfo', { page, pages: pageCount }) }}</p>
      <button type="button" class="btn btn-secondary" :disabled="page >= pageCount" @click="goToPage(page + 1)">{{ t('adminVideos.next') }}</button>
    </div>

    <FormDialog v-model:open="formOpen" :title="formVideo ? t('adminVideos.formEdit') : t('adminVideos.formNew')" :description="t('adminVideos.formHint')">
      <VideoForm :video="formVideo" @saved="onSaved" @close="formOpen = false" />
    </FormDialog>
  </div>
</template>
