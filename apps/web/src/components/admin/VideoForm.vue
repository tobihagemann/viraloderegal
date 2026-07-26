<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { CLIP_MAX_DURATION_SEC, CLIP_MIN_DURATION_SEC, videoUpsertSchema, youtubeIdSchema } from '@viraloderegal/shared';
import { postJson, useErrorText } from '../../composables/useErrorText.js';
import ClipPreview from './ClipPreview.vue';

export interface VideoRow {
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

const props = defineProps<{ video: VideoRow | null }>();
const emit = defineEmits<{ saved: []; close: [] }>();

const { t } = useI18n();
const resolveError = useErrorText();
const uid = useId();

// youtubeId is the upsert key, so an existing row's id is locked.
const editingExisting = computed(() => props.video !== null);
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
// Drives the hint's tone only; the save gate below derives from the shared schema.
const clipLengthValid = computed(
  () =>
    Number.isInteger(clipStartSec.value) &&
    Number.isInteger(clipEndSec.value) &&
    clipLength.value >= CLIP_MIN_DURATION_SEC &&
    clipLength.value <= CLIP_MAX_DURATION_SEC,
);
const youtubeIdValid = computed(() => youtubeIdSchema.safeParse(formYoutubeId.value).success);

// Derived from the shared schema so a rule tightened in packages/shared tightens this form with no change.
const payload = computed(() => ({
  youtubeId: formYoutubeId.value,
  clipStartSec: clipStartSec.value,
  clipEndSec: clipEndSec.value,
  enabled: formEnabled.value,
  randomEligible: formRandomEligible.value,
  notes: formNotes.value.trim() ? formNotes.value.trim() : null,
}));
const parsed = computed(() => videoUpsertSchema.safeParse(payload.value));
const canSave = computed(() => parsed.value.success && !submitting.value);
const canPreview = computed(() => parsed.value.success);

// The dialog unmounts this form on close, so this normally only fires on setup; kept a watcher so the form
// still follows the prop if it ever outlives a close.
watch(
  () => props.video,
  (video) => {
    formYoutubeId.value = video?.youtubeId ?? '';
    formClipStart.value = String(video?.clipStartSec ?? 0);
    formClipEnd.value = String(video?.clipEndSec ?? 0);
    formEnabled.value = video?.enabled ?? true;
    formRandomEligible.value = video?.randomEligible ?? true;
    formNotes.value = video?.notes ?? '';
    formMetadata.value =
      video && video.title && video.channel && video.durationSec !== null && video.viewCount !== null
        ? { title: video.title, channel: video.channel, durationSec: video.durationSec, viewCount: video.viewCount }
        : null;
    formError.value = null;
    formNotice.value = null;
    showPreview.value = false;
  },
  { immediate: true },
);

async function loadMetadata(): Promise<void> {
  if (!youtubeIdValid.value || submitting.value) {
    return;
  }
  formError.value = null;
  formNotice.value = null;
  const result = await postJson<{ title: string; channel: string; durationSec: number; viewCount: number }>('/api/admin/videos/metadata', {
    youtubeId: formYoutubeId.value,
  });
  if (!result.ok) {
    formError.value = resolveError(result.code);
    return;
  }
  formMetadata.value = result.data;
  formNotice.value = t('adminVideos.metadataLoaded');
}

async function saveVideo(): Promise<void> {
  if (!parsed.value.success || submitting.value) {
    return;
  }
  submitting.value = true;
  formError.value = null;
  formNotice.value = null;
  const result = await postJson('/api/admin/videos', parsed.value.data);
  submitting.value = false;
  if (!result.ok) {
    formError.value = resolveError(result.code);
    return;
  }
  emit('saved');
}

function startPreview(): void {
  if (!canPreview.value) {
    return;
  }
  previewToken.value += 1;
  showPreview.value = true;
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="saveVideo">
    <div class="flex flex-col gap-1.5">
      <label :for="`${uid}-id`" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.youtubeIdLabel') }}</label>
      <div class="flex flex-col gap-2 sm:flex-row">
        <input
          :id="`${uid}-id`"
          v-model="formYoutubeId"
          name="youtube-id"
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
        <dt class="inline font-medium text-neutral-700">{{ t('adminVideos.metaTitle') }}:</dt>
        <dd class="ml-1 inline text-neutral-600">{{ formMetadata.title }}</dd>
      </div>
      <div>
        <dt class="inline font-medium text-neutral-700">{{ t('adminVideos.metaChannel') }}:</dt>
        <dd class="ml-1 inline text-neutral-600">{{ formMetadata.channel }}</dd>
      </div>
      <div>
        <dt class="inline font-medium text-neutral-700">{{ t('adminVideos.metaDuration') }}:</dt>
        <dd class="ml-1 inline text-neutral-600 tabular-nums">{{ formMetadata.durationSec }} {{ t('common.seconds') }}</dd>
      </div>
      <div>
        <dt class="inline font-medium text-neutral-700">{{ t('adminVideos.metaViews') }}:</dt>
        <dd class="ml-1 inline text-neutral-600 tabular-nums">{{ formMetadata.viewCount.toLocaleString('de-DE') }}</dd>
      </div>
    </dl>

    <div class="grid grid-cols-2 gap-4">
      <div class="flex flex-col gap-1.5">
        <label :for="`${uid}-start`" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.clipStart') }}</label>
        <input :id="`${uid}-start`" v-model="formClipStart" name="clip-start" type="number" min="0" class="field tabular-nums" />
      </div>
      <div class="flex flex-col gap-1.5">
        <label :for="`${uid}-end`" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.clipEnd') }}</label>
        <input :id="`${uid}-end`" v-model="formClipEnd" name="clip-end" type="number" min="0" class="field tabular-nums" />
      </div>
    </div>
    <p :class="clipLengthValid ? 'text-neutral-500' : 'text-red-600'" class="text-sm">
      {{ t('adminVideos.clipLengthHint', { min: CLIP_MIN_DURATION_SEC, max: CLIP_MAX_DURATION_SEC }) }}
    </p>

    <div class="flex flex-wrap gap-4">
      <label class="flex items-center gap-2 text-sm text-neutral-700"
        ><input v-model="formEnabled" name="enabled" type="checkbox" />{{ t('adminVideos.enabledLabel') }}</label
      >
      <label class="flex items-center gap-2 text-sm text-neutral-700"
        ><input v-model="formRandomEligible" name="random-eligible" type="checkbox" />{{ t('adminVideos.randomEligibleLabel') }}</label
      >
    </div>

    <div class="flex flex-col gap-1.5">
      <label :for="`${uid}-notes`" class="text-sm font-medium text-neutral-700">{{ t('adminVideos.notesLabel') }}</label>
      <textarea :id="`${uid}-notes`" v-model="formNotes" name="notes" rows="2" class="field"></textarea>
    </div>

    <ClipPreview v-if="showPreview" :key="previewToken" :video-id="formYoutubeId" :start-sec="clipStartSec" :end-sec="clipEndSec" />

    <p v-if="formNotice" class="text-sm text-neutral-600">{{ formNotice }}</p>
    <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn btn-secondary" :disabled="!canPreview" @click="startPreview">{{ t('adminVideos.testClip') }}</button>
      <button type="button" class="btn btn-secondary" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button type="submit" class="btn btn-primary" :disabled="!canSave">{{ t('adminVideos.save') }}</button>
    </div>
  </form>
</template>
