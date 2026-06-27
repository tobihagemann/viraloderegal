<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowPathIcon, PencilSquareIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { CLIP_MAX_DURATION_SEC, CLIP_MIN_DURATION_SEC, YOUTUBE_ID_LENGTH } from '@viraloderegal/shared';
import { errorCode, useErrorText } from '../../composables/useErrorText.js';
import ClipPreview from '../../components/admin/ClipPreview.vue';
import SearchField from '../../components/admin/SearchField.vue';

interface VideoRow {
  youtubeId: string;
  title: string | null;
  channel: string | null;
  durationSec: number | null;
  clipStartSec: number;
  clipEndSec: number;
  viewCount: number | null;
  snapshotRefreshedAt: string | null;
  enabled: boolean;
  randomEligible: boolean;
  notes: string | null;
}

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

// Form: youtubeId identifies the row (the upsert key), so editing an existing video locks the id.
const editingExisting = ref(false);
const formYoutubeId = ref('');
const formClipStart = ref('0');
const formClipEnd = ref('0');
const formEnabled = ref(true);
const formRandomEligible = ref(true);
const formNotes = ref('');
const formMetadata = ref<{ title: string; channel: string; durationSec: number; viewCount: number } | null>(null);
const formError = ref<string | null>(null);
const formNotice = ref<string | null>(null);
const submitting = ref(false);
const previewToken = ref(0);
const showPreview = ref(false);

const clipStartSec = computed(() => Number(formClipStart.value));
const clipEndSec = computed(() => Number(formClipEnd.value));
const clipLength = computed(() => clipEndSec.value - clipStartSec.value);
const clipLengthValid = computed(
  () =>
    Number.isInteger(clipStartSec.value) &&
    Number.isInteger(clipEndSec.value) &&
    clipLength.value >= CLIP_MIN_DURATION_SEC &&
    clipLength.value <= CLIP_MAX_DURATION_SEC,
);
const youtubeIdValid = computed(() => formYoutubeId.value.length === YOUTUBE_ID_LENGTH);
const canSave = computed(() => youtubeIdValid.value && clipLengthValid.value && !submitting.value);
const canPreview = computed(() => youtubeIdValid.value && clipLengthValid.value);

async function loadVideos(): Promise<void> {
  listError.value = null;
  const params = new URLSearchParams({ page: String(page.value), pageSize: String(PAGE_SIZE) });
  if (search.value.trim()) {
    params.set('q', search.value.trim());
  }
  try {
    const res = await fetch(`/api/admin/videos?${params.toString()}`);
    if (!res.ok) {
      listError.value = resolveError(errorCode(await res.json().catch(() => null)));
      return;
    }
    const data = (await res.json()) as { videos: VideoRow[]; total: number };
    videos.value = data.videos;
    total.value = data.total;
  } catch {
    listError.value = resolveError('generic');
  }
}

async function loadStatus(): Promise<void> {
  try {
    const res = await fetch('/api/admin/videos/status');
    if (res.ok) {
      quotaExhausted.value = ((await res.json()) as { quotaExhausted: boolean }).quotaExhausted;
    }
  } catch {
    // A missing status read is non-fatal; the banner just stays hidden.
  }
}

function runSearch(): void {
  page.value = 1;
  void loadVideos();
}

function goToPage(next: number): void {
  page.value = Math.min(pageCount.value, Math.max(1, next));
  void loadVideos();
}

function resetForm(): void {
  editingExisting.value = false;
  formYoutubeId.value = '';
  formClipStart.value = '0';
  formClipEnd.value = '0';
  formEnabled.value = true;
  formRandomEligible.value = true;
  formNotes.value = '';
  formMetadata.value = null;
  formError.value = null;
  formNotice.value = null;
  showPreview.value = false;
}

function editVideo(video: VideoRow): void {
  resetForm();
  editingExisting.value = true;
  formYoutubeId.value = video.youtubeId;
  formClipStart.value = String(video.clipStartSec);
  formClipEnd.value = String(video.clipEndSec);
  formEnabled.value = video.enabled;
  formRandomEligible.value = video.randomEligible;
  formNotes.value = video.notes ?? '';
  if (video.title && video.channel && video.durationSec !== null && video.viewCount !== null) {
    formMetadata.value = { title: video.title, channel: video.channel, durationSec: video.durationSec, viewCount: video.viewCount };
  }
}

async function loadMetadata(): Promise<void> {
  if (!youtubeIdValid.value || submitting.value) {
    return;
  }
  formError.value = null;
  formNotice.value = null;
  try {
    const res = await fetch('/api/admin/videos/metadata', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ youtubeId: formYoutubeId.value }),
    });
    if (!res.ok) {
      formError.value = resolveError(errorCode(await res.json().catch(() => null)));
      return;
    }
    formMetadata.value = (await res.json()) as { title: string; channel: string; durationSec: number; viewCount: number };
    formNotice.value = t('adminVideos.metadataLoaded');
  } catch {
    formError.value = resolveError('generic');
  }
}

async function saveVideo(): Promise<void> {
  if (!canSave.value) {
    return;
  }
  submitting.value = true;
  formError.value = null;
  formNotice.value = null;
  try {
    const res = await fetch('/api/admin/videos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        youtubeId: formYoutubeId.value,
        clipStartSec: clipStartSec.value,
        clipEndSec: clipEndSec.value,
        enabled: formEnabled.value,
        randomEligible: formRandomEligible.value,
        notes: formNotes.value.trim() ? formNotes.value.trim() : null,
      }),
    });
    if (!res.ok) {
      formError.value = resolveError(errorCode(await res.json().catch(() => null)));
      return;
    }
    resetForm();
    await Promise.all([loadVideos(), loadStatus()]);
  } catch {
    formError.value = resolveError('generic');
  } finally {
    submitting.value = false;
  }
}

async function refreshVideo(video: VideoRow): Promise<void> {
  try {
    const res = await fetch(`/api/admin/videos/${video.youtubeId}/refresh`, { method: 'POST' });
    if (!res.ok) {
      listError.value = resolveError(errorCode(await res.json().catch(() => null)));
    }
    await Promise.all([loadVideos(), loadStatus()]);
  } catch {
    listError.value = resolveError('generic');
  }
}

function startPreview(): void {
  if (!canPreview.value) {
    return;
  }
  previewToken.value += 1;
  showPreview.value = true;
}

onMounted(() => {
  void loadVideos();
  void loadStatus();
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('adminVideos.heading') }}</h1>
      <RouterLink :to="{ name: 'admin' }" class="btn btn-secondary">{{ t('adminNav.backToAdmin') }}</RouterLink>
    </div>

    <p v-if="quotaExhausted" class="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">{{ t('adminVideos.quotaBanner') }}</p>

    <section class="card flex flex-col gap-4">
      <form class="flex flex-col gap-3 sm:flex-row" @submit.prevent="runSearch">
        <SearchField v-model="search" :placeholder="t('adminVideos.searchPlaceholder')" />
        <button type="submit" class="btn btn-secondary sm:w-auto">{{ t('adminVideos.search') }}</button>
      </form>

      <p v-if="listError" class="text-sm text-red-600">{{ listError }}</p>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <thead class="text-xs text-neutral-500 uppercase">
            <tr>
              <th class="py-2 pr-3">{{ t('adminVideos.colVideo') }}</th>
              <th class="py-2 pr-3">{{ t('adminVideos.colClip') }}</th>
              <th class="py-2 pr-3">{{ t('adminVideos.colViews') }}</th>
              <th class="py-2 pr-3">{{ t('adminVideos.colFlags') }}</th>
              <th class="py-2"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="video in videos" :key="video.youtubeId" class="border-t border-neutral-100 align-top">
              <td class="py-2 pr-3">
                <p class="font-medium text-neutral-900">{{ video.title ?? video.youtubeId }}</p>
                <p class="text-xs text-neutral-500">{{ video.channel ?? '—' }} · {{ video.youtubeId }}</p>
              </td>
              <td class="py-2 pr-3 whitespace-nowrap">{{ video.clipStartSec }}–{{ video.clipEndSec }} {{ t('common.seconds') }}</td>
              <td class="py-2 pr-3 whitespace-nowrap">{{ video.viewCount !== null ? video.viewCount.toLocaleString('de-DE') : '—' }}</td>
              <td class="py-2 pr-3">
                <span v-if="!video.enabled" class="text-xs text-neutral-500">{{ t('adminVideos.flagDisabled') }}</span>
                <span v-else-if="!video.randomEligible" class="text-xs text-neutral-500">{{ t('adminVideos.flagSetOnly') }}</span>
                <span v-else class="text-xs text-neutral-500">{{ t('adminVideos.flagPool') }}</span>
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

      <div class="flex items-center justify-between text-sm text-neutral-600">
        <button type="button" class="btn btn-secondary" :disabled="page <= 1" @click="goToPage(page - 1)">{{ t('adminVideos.prev') }}</button>
        <span>{{ t('adminVideos.pageInfo', { page, pages: pageCount }) }}</span>
        <button type="button" class="btn btn-secondary" :disabled="page >= pageCount" @click="goToPage(page + 1)">{{ t('adminVideos.next') }}</button>
      </div>
    </section>

    <section class="card flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium">{{ editingExisting ? t('adminVideos.formEdit') : t('adminVideos.formNew') }}</h2>
        <button v-if="editingExisting" type="button" class="text-sm font-medium text-neutral-600 hover:underline" @click="resetForm">
          {{ t('adminVideos.newVideo') }}
        </button>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="video-id" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.youtubeIdLabel') }}</label>
        <div class="flex flex-col gap-2 sm:flex-row">
          <input
            id="video-id"
            v-model="formYoutubeId"
            :disabled="editingExisting"
            class="field font-mono"
            :placeholder="t('adminVideos.youtubeIdPlaceholder')"
          />
          <button type="button" class="btn btn-secondary sm:w-auto" :disabled="!youtubeIdValid || submitting" @click="loadMetadata">
            {{ t('adminVideos.loadMetadata') }}
          </button>
        </div>
      </div>

      <dl v-if="formMetadata" class="grid grid-cols-1 gap-1 rounded-lg bg-neutral-50 px-3 py-2.5 text-sm sm:grid-cols-2">
        <div>
          <dt class="inline text-neutral-500">{{ t('adminVideos.metaTitle') }}:</dt>
          <dd class="ml-1 inline text-neutral-900">{{ formMetadata.title }}</dd>
        </div>
        <div>
          <dt class="inline text-neutral-500">{{ t('adminVideos.metaChannel') }}:</dt>
          <dd class="ml-1 inline text-neutral-900">{{ formMetadata.channel }}</dd>
        </div>
        <div>
          <dt class="inline text-neutral-500">{{ t('adminVideos.metaDuration') }}:</dt>
          <dd class="ml-1 inline text-neutral-900">{{ formMetadata.durationSec }} {{ t('common.seconds') }}</dd>
        </div>
        <div>
          <dt class="inline text-neutral-500">{{ t('adminVideos.metaViews') }}:</dt>
          <dd class="ml-1 inline text-neutral-900">{{ formMetadata.viewCount.toLocaleString('de-DE') }}</dd>
        </div>
      </dl>

      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-1.5">
          <label for="clip-start" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.clipStart') }}</label>
          <input id="clip-start" v-model="formClipStart" type="number" min="0" class="field" />
        </div>
        <div class="flex flex-col gap-1.5">
          <label for="clip-end" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.clipEnd') }}</label>
          <input id="clip-end" v-model="formClipEnd" type="number" min="0" class="field" />
        </div>
      </div>
      <p :class="clipLengthValid ? 'text-neutral-500' : 'text-red-600'" class="text-sm">
        {{ t('adminVideos.clipLengthHint', { min: CLIP_MIN_DURATION_SEC, max: CLIP_MAX_DURATION_SEC }) }}
      </p>

      <div class="flex flex-wrap gap-4">
        <label class="flex items-center gap-2 text-sm text-neutral-700"
          ><input v-model="formEnabled" type="checkbox" />{{ t('adminVideos.enabledLabel') }}</label
        >
        <label class="flex items-center gap-2 text-sm text-neutral-700"
          ><input v-model="formRandomEligible" type="checkbox" />{{ t('adminVideos.randomEligibleLabel') }}</label
        >
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="video-notes" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.notesLabel') }}</label>
        <textarea id="video-notes" v-model="formNotes" rows="2" class="field"></textarea>
      </div>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn btn-secondary" :disabled="!canPreview" @click="startPreview">{{ t('adminVideos.testClip') }}</button>
        <button type="button" class="btn btn-primary" :disabled="!canSave" @click="saveVideo">{{ t('adminVideos.save') }}</button>
      </div>

      <ClipPreview v-if="showPreview" :key="previewToken" :video-id="formYoutubeId" :start-sec="clipStartSec" :end-sec="clipEndSec" />

      <p v-if="formNotice" class="text-sm text-neutral-600">{{ formNotice }}</p>
      <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
    </section>
  </div>
</template>
