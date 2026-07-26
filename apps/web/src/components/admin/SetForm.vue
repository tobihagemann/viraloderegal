<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, XMarkIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { curatedSetUpsertSchema } from '@viraloderegal/shared';
import { postJson, requestJson, useErrorText } from '../../composables/useErrorText.js';
import SearchField from './SearchField.vue';

export interface VideoRef {
  youtubeId: string;
  title: string | null;
  channel: string | null;
}

export interface SetRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  videoOrder: string[];
  videos: VideoRef[];
  unreadyVideos: string[];
}

const props = defineProps<{ set: SetRow | null }>();
const emit = defineEmits<{ saved: []; close: [] }>();

const { t } = useI18n();
const resolveError = useErrorText();
const uid = useId();

const formName = ref('');
const formDescription = ref('');
const formEnabled = ref(true);
const order = ref<VideoRef[]>([]);
const formError = ref<string | null>(null);
const submitting = ref(false);

const query = ref('');
const results = ref<VideoRef[]>([]);

const orderedIds = computed(() => order.value.map((video) => video.youtubeId));

// Derived from the shared schema so a rule tightened in packages/shared tightens this form with no change.
const payload = computed(() => ({
  name: formName.value.trim(),
  description: formDescription.value.trim() ? formDescription.value.trim() : null,
  videoOrder: orderedIds.value,
  enabled: formEnabled.value,
}));
const parsed = computed(() => curatedSetUpsertSchema.safeParse(payload.value));
const canSave = computed(() => parsed.value.success && !submitting.value);

// The dialog unmounts this form on close, so this normally only fires on setup; kept a watcher so the form
// still follows the prop if it ever outlives a close.
watch(
  () => props.set,
  (set) => {
    formName.value = set?.name ?? '';
    formDescription.value = set?.description ?? '';
    formEnabled.value = set?.enabled ?? true;
    const byId = new Map((set?.videos ?? []).map((video) => [video.youtubeId, video]));
    order.value = (set?.videoOrder ?? []).map((id) => byId.get(id) ?? { youtubeId: id, title: null, channel: null });
    formError.value = null;
  },
  { immediate: true },
);

async function searchVideos(): Promise<void> {
  const params = new URLSearchParams({ pageSize: '20' });
  if (query.value.trim()) {
    params.set('q', query.value.trim());
  }
  const result = await requestJson<{ videos: VideoRef[] }>(`/api/admin/videos?${params.toString()}`);
  if (result.ok) {
    results.value = result.data.videos;
  }
  // A failed library search is non-fatal; the admin can retry.
}

onMounted(() => {
  void searchVideos();
});

function addVideo(video: VideoRef): void {
  if (!orderedIds.value.includes(video.youtubeId)) {
    order.value.push({ youtubeId: video.youtubeId, title: video.title, channel: video.channel });
  }
}

function removeVideo(index: number): void {
  order.value.splice(index, 1);
}

function move(index: number, delta: number): void {
  const target = index + delta;
  const video = order.value[index];
  if (!video || target < 0 || target >= order.value.length) {
    return;
  }
  order.value.splice(index, 1);
  order.value.splice(target, 0, video);
}

async function saveSet(): Promise<void> {
  if (!parsed.value.success || submitting.value) {
    return;
  }
  submitting.value = true;
  formError.value = null;
  // An id turns the create payload into an update; the shared schema stays id-free, so it rides alongside.
  const result = await postJson('/api/admin/sets', props.set ? { ...parsed.value.data, id: props.set.id } : parsed.value.data);
  submitting.value = false;
  if (!result.ok) {
    formError.value = resolveError(result.code);
    return;
  }
  emit('saved');
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="saveSet">
    <div class="flex flex-col gap-1.5">
      <label :for="`${uid}-name`" class="text-sm font-medium text-neutral-700">{{ t('adminSets.nameLabel') }}</label>
      <input :id="`${uid}-name`" v-model="formName" name="set-name" class="field" :placeholder="t('adminSets.namePlaceholder')" />
    </div>

    <div class="flex flex-col gap-1.5">
      <label :for="`${uid}-description`" class="text-sm font-medium text-neutral-700">{{ t('adminSets.descriptionLabel') }}</label>
      <textarea :id="`${uid}-description`" v-model="formDescription" name="set-description" rows="2" class="field"></textarea>
    </div>

    <label class="flex items-center gap-2 text-sm text-neutral-700"
      ><input v-model="formEnabled" name="set-enabled" type="checkbox" />{{ t('adminSets.enabledLabel') }}</label
    >

    <div class="grid gap-4 sm:grid-cols-2">
      <div class="flex min-w-0 flex-col gap-2">
        <p class="text-sm font-medium text-neutral-700">{{ t('adminSets.libraryHeading') }}</p>
        <div class="flex gap-2">
          <SearchField v-model="query" :placeholder="t('adminSets.pickerPlaceholder')" @search="searchVideos" />
          <button type="button" class="btn btn-secondary shrink-0" @click="searchVideos">{{ t('adminSets.pickerSearch') }}</button>
        </div>
        <ul role="list" class="flex h-64 flex-col divide-y divide-neutral-950/5 overflow-y-auto rounded-lg p-3 ring-1 ring-neutral-950/10">
          <li v-for="video in results" :key="video.youtubeId" class="flex items-center gap-2 py-2 text-sm first:pt-0 last:pb-0">
            <button
              v-if="!orderedIds.includes(video.youtubeId)"
              type="button"
              class="icon-btn icon-btn-accent shrink-0"
              :aria-label="t('adminSets.add')"
              :title="t('adminSets.add')"
              @click="addVideo(video)"
            >
              <PlusIcon class="size-4" />
            </button>
            <!-- Heroicons hardcode aria-hidden and drop stray attrs, so the state is named on a real element. -->
            <template v-else>
              <CheckIcon class="size-4 shrink-0 p-px text-emerald-600" />
              <span class="sr-only">{{ t('adminSets.added') }}</span>
            </template>
            <span class="min-w-0 flex-1 truncate" :class="orderedIds.includes(video.youtubeId) ? 'text-neutral-400' : ''"
              >{{ video.title ?? video.youtubeId }} <span class="text-neutral-500">{{ video.channel ?? '' }}</span></span
            >
          </li>
          <li v-if="results.length === 0" class="py-6 text-center text-sm text-neutral-500">{{ t('adminSets.pickerEmpty') }}</li>
        </ul>
      </div>

      <div class="flex min-w-0 flex-col gap-2">
        <p class="text-sm font-medium text-neutral-700">{{ t('adminSets.inSetHeading') }}</p>
        <!-- Matches the height of the library's search row so both lists start on the same line. -->
        <p class="flex min-h-11 items-center text-sm text-neutral-500 tabular-nums sm:min-h-9">
          {{ t('adminSets.roundCount', { count: order.length }) }}
        </p>
        <ol role="list" class="flex h-64 flex-col gap-2 overflow-y-auto rounded-lg p-3 ring-1 ring-neutral-950/10">
          <li v-for="(video, index) in order" :key="video.youtubeId" class="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">
            <span class="truncate"
              ><span class="text-neutral-500">{{ index + 1 }}.</span> {{ video.title ?? video.youtubeId }}</span
            >
            <span class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                class="icon-btn icon-btn-neutral"
                :disabled="index === 0"
                :aria-label="t('adminSets.moveUp')"
                :title="t('adminSets.moveUp')"
                @click="move(index, -1)"
              >
                <ChevronUpIcon class="size-4" />
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-neutral"
                :disabled="index === order.length - 1"
                :aria-label="t('adminSets.moveDown')"
                :title="t('adminSets.moveDown')"
                @click="move(index, 1)"
              >
                <ChevronDownIcon class="size-4" />
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-accent"
                :aria-label="t('adminSets.remove')"
                :title="t('adminSets.remove')"
                @click="removeVideo(index)"
              >
                <XMarkIcon class="size-4" />
              </button>
            </span>
          </li>
          <li v-if="order.length === 0" class="py-6 text-center text-sm text-neutral-500">{{ t('adminSets.orderEmpty') }}</li>
        </ol>
      </div>
    </div>

    <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>

    <div class="flex flex-wrap gap-2">
      <button type="button" class="btn btn-secondary" @click="emit('close')">{{ t('common.cancel') }}</button>
      <button type="submit" class="btn btn-primary" :disabled="!canSave">{{ t('adminSets.save') }}</button>
    </div>
  </form>
</template>
