<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ChevronDownIcon, ChevronUpIcon, PencilSquareIcon, PlusIcon, TrashIcon, XMarkIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { errorCode, useErrorText } from '../../composables/useErrorText.js';
import SearchField from '../../components/admin/SearchField.vue';

interface VideoRef {
  youtubeId: string;
  title: string | null;
  channel: string | null;
}

interface SetRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  videoOrder: string[];
  videos: VideoRef[];
  unreadyVideos: string[];
}

const { t } = useI18n();
const resolveError = useErrorText();

const sets = ref<SetRow[]>([]);
const listError = ref<string | null>(null);

// editingId null means a new set (vs. editing an existing one).
const editingId = ref<string | null>(null);
const formName = ref('');
const formDescription = ref('');
const formEnabled = ref(true);
const order = ref<VideoRef[]>([]);
const formError = ref<string | null>(null);
const submitting = ref(false);

const pickerQuery = ref('');
const pickerResults = ref<VideoRef[]>([]);

const orderedIds = computed(() => order.value.map((video) => video.youtubeId));
const canSave = computed(() => formName.value.trim().length > 0 && order.value.length > 0 && !submitting.value);

async function loadSets(): Promise<void> {
  listError.value = null;
  try {
    const res = await fetch('/api/admin/sets');
    if (!res.ok) {
      listError.value = resolveError(errorCode(await res.json().catch(() => null)));
      return;
    }
    sets.value = ((await res.json()) as { sets: SetRow[] }).sets;
  } catch {
    listError.value = resolveError('generic');
  }
}

async function searchVideos(): Promise<void> {
  const params = new URLSearchParams({ pageSize: '20' });
  if (pickerQuery.value.trim()) {
    params.set('q', pickerQuery.value.trim());
  }
  try {
    const res = await fetch(`/api/admin/videos?${params.toString()}`);
    if (res.ok) {
      pickerResults.value = ((await res.json()) as { videos: VideoRef[] }).videos;
    }
  } catch {
    // A failed picker search is non-fatal; the admin can retry.
  }
}

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

function resetForm(): void {
  editingId.value = null;
  formName.value = '';
  formDescription.value = '';
  formEnabled.value = true;
  order.value = [];
  formError.value = null;
}

function editSet(set: SetRow): void {
  resetForm();
  editingId.value = set.id;
  formName.value = set.name;
  formDescription.value = set.description ?? '';
  formEnabled.value = set.enabled;
  const byId = new Map(set.videos.map((video) => [video.youtubeId, video]));
  order.value = set.videoOrder.map((id) => byId.get(id) ?? { youtubeId: id, title: null, channel: null });
}

async function saveSet(): Promise<void> {
  if (!canSave.value) {
    return;
  }
  submitting.value = true;
  formError.value = null;
  try {
    const res = await fetch('/api/admin/sets', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(editingId.value ? { id: editingId.value } : {}),
        name: formName.value.trim(),
        description: formDescription.value.trim() ? formDescription.value.trim() : null,
        videoOrder: orderedIds.value,
        enabled: formEnabled.value,
      }),
    });
    if (!res.ok) {
      formError.value = resolveError(errorCode(await res.json().catch(() => null)));
      return;
    }
    resetForm();
    await loadSets();
  } catch {
    formError.value = resolveError('generic');
  } finally {
    submitting.value = false;
  }
}

async function deleteSet(set: SetRow): Promise<void> {
  try {
    await fetch(`/api/admin/sets/${set.id}`, { method: 'DELETE' });
    if (editingId.value === set.id) {
      resetForm();
    }
    await loadSets();
  } catch {
    listError.value = resolveError('generic');
  }
}

onMounted(() => {
  void loadSets();
  void searchVideos();
});
</script>

<template>
  <div class="mx-auto flex w-full max-w-4xl flex-col gap-6">
    <div class="flex items-center justify-between gap-4">
      <h1 class="text-2xl font-semibold tracking-tight">{{ t('adminSets.heading') }}</h1>
      <RouterLink :to="{ name: 'admin' }" class="btn btn-secondary">{{ t('adminNav.backToAdmin') }}</RouterLink>
    </div>

    <p v-if="listError" class="text-sm text-red-600">{{ listError }}</p>

    <section class="card flex flex-col gap-3">
      <h2 class="text-lg font-medium">{{ t('adminSets.listHeading') }}</h2>
      <ul class="flex flex-col divide-y divide-neutral-100">
        <li v-for="set in sets" :key="set.id" class="flex items-center justify-between gap-4 py-3">
          <div>
            <p class="font-medium text-neutral-900">{{ set.name }}</p>
            <p class="text-xs text-neutral-500">
              {{ t('adminSets.roundCount', { count: set.videoOrder.length }) }} ·
              {{ set.enabled ? t('adminSets.stateEnabled') : t('adminSets.stateDisabled') }} ·
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
    </section>

    <section class="card flex flex-col gap-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-medium">{{ editingId ? t('adminSets.formEdit') : t('adminSets.formNew') }}</h2>
        <button v-if="editingId" type="button" class="text-sm font-medium text-neutral-600 hover:underline" @click="resetForm">
          {{ t('adminSets.newSet') }}
        </button>
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="set-name" class="text-sm font-medium text-neutral-700">{{ t('adminSets.nameLabel') }}</label>
        <input id="set-name" v-model="formName" class="field" :placeholder="t('adminSets.namePlaceholder')" />
      </div>

      <div class="flex flex-col gap-1.5">
        <label for="set-description" class="text-sm font-medium text-neutral-700">{{ t('adminSets.descriptionLabel') }}</label>
        <textarea id="set-description" v-model="formDescription" rows="2" class="field"></textarea>
      </div>

      <label class="flex items-center gap-2 text-sm text-neutral-700"><input v-model="formEnabled" type="checkbox" />{{ t('adminSets.enabledLabel') }}</label>

      <div class="flex flex-col gap-2">
        <p class="text-sm font-medium text-neutral-700">{{ t('adminSets.orderHeading') }}</p>
        <p class="text-xs text-neutral-500">{{ t('adminSets.orderHint') }}</p>
        <ol class="flex flex-col gap-2">
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
          <li v-if="order.length === 0" class="text-sm text-neutral-500">{{ t('adminSets.orderEmpty') }}</li>
        </ol>
      </div>

      <div class="flex flex-col gap-2 rounded-lg ring-1 ring-neutral-100 p-3">
        <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="searchVideos">
          <SearchField v-model="pickerQuery" :placeholder="t('adminSets.pickerPlaceholder')" />
          <button type="submit" class="btn btn-secondary sm:w-auto">{{ t('adminSets.pickerSearch') }}</button>
        </form>
        <ul class="flex max-h-48 flex-col divide-y divide-neutral-100 overflow-y-auto">
          <li v-for="video in pickerResults" :key="video.youtubeId" class="flex items-center gap-2 py-2 text-sm">
            <button
              type="button"
              class="icon-btn icon-btn-accent shrink-0"
              :disabled="orderedIds.includes(video.youtubeId)"
              :aria-label="t('adminSets.add')"
              :title="t('adminSets.add')"
              @click="addVideo(video)"
            >
              <PlusIcon class="size-4" />
            </button>
            <span class="min-w-0 flex-1 truncate"
              >{{ video.title ?? video.youtubeId }} <span class="text-xs text-neutral-500">{{ video.channel ?? '' }}</span></span
            >
          </li>
        </ul>
      </div>

      <button type="button" class="btn btn-primary sm:self-start" :disabled="!canSave" @click="saveSet">{{ t('adminSets.save') }}</button>
      <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
    </section>
  </div>
</template>
