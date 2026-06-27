<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  USERNAME_MAX_LENGTH,
  createRoomResponseSchema,
  joinRoomResponseSchema,
  roomCodeSchema,
  validateUsername,
} from '@viraloderegal/shared';
import { storeSessionToken } from '../composables/useStorage.js';
import { errorCode, toDisplayErrorCode, useErrorText } from '../composables/useErrorText.js';

const router = useRouter();
const route = useRoute();
const { t } = useI18n();
const resolveError = useErrorText();

// One intent at a time: the active tab keeps the name field adjacent to the chosen path's fields and shows a
// single primary action, instead of two competing paths around a detached name field.
const tab = ref<'create' | 'join'>('create');
const name = ref('');
const code = ref('');
const submitting = ref(false);
const formError = ref<string | null>(null);

// Surface a terminal error handed off from the room view (an expired/cleaned-up session, or a ban), then drop
// the query param so a later reload of the home screen doesn't re-show a stale message.
if (typeof route.query.error === 'string') {
  formError.value = resolveError(toDisplayErrorCode(route.query.error));
  void router.replace({ query: {} });
}

const nameResult = computed(() => validateUsername(name.value));
const nameValid = computed(() => nameResult.value.ok);
// Submit the normalized name (trimmed, collapsed spaces) so create/join match the rename flow.
const submittedName = computed(() => (nameResult.value.ok ? nameResult.value.name : name.value));
// Only surface a validation message once the user has typed; an empty field shouldn't read as an error.
const nameError = computed(() => (name.value.length > 0 && !nameResult.value.ok ? resolveError(nameResult.value.error) : null));

const codeComplete = computed(() => code.value.length === ROOM_CODE_LENGTH);

// Mask the code field to the room-code alphabet, uppercased and length-capped, mirroring roomCodeSchema.
watch(code, (value) => {
  const cleaned = value
    .toUpperCase()
    .split('')
    .filter((char) => ROOM_CODE_ALPHABET.includes(char))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
  if (cleaned !== value) {
    code.value = cleaned;
  }
});

async function postJson(path: string, body: unknown): Promise<{ status: number; data: unknown }> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

async function onCreate(): Promise<void> {
  if (!nameValid.value || submitting.value) return;
  submitting.value = true;
  formError.value = null;
  try {
    const { status, data } = await postJson('/rooms', { name: submittedName.value });
    if (status === 201) {
      const room = createRoomResponseSchema.parse(data);
      storeSessionToken(room.code, room.sessionToken);
      void router.push({ name: 'room', params: { code: room.code } });
      return;
    }
    formError.value = resolveError(errorCode(data));
  } catch {
    formError.value = resolveError('generic');
  } finally {
    submitting.value = false;
  }
}

async function onJoin(): Promise<void> {
  if (!nameValid.value || !codeComplete.value || submitting.value) return;
  submitting.value = true;
  formError.value = null;
  try {
    const normalizedCode = roomCodeSchema.parse(code.value);
    const { status, data } = await postJson('/rooms/join', { code: normalizedCode, name: submittedName.value });
    if (status === 200) {
      const joined = joinRoomResponseSchema.parse(data);
      storeSessionToken(normalizedCode, joined.sessionToken);
      void router.push({ name: 'room', params: { code: normalizedCode } });
      return;
    }
    formError.value = resolveError(errorCode(data));
  } catch {
    formError.value = resolveError('generic');
  } finally {
    submitting.value = false;
  }
}

function onSubmit(): void {
  if (tab.value === 'create') {
    void onCreate();
  } else {
    void onJoin();
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-8">
    <div class="text-center">
      <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{{ t('app.title') }}</h1>
      <p class="mx-auto mt-3 max-w-[40ch] text-base text-pretty text-neutral-600">{{ t('app.tagline') }}</p>
    </div>

    <form class="flex flex-col gap-5" @submit.prevent="onSubmit">
      <div>
        <label for="name" class="block text-sm font-medium text-neutral-700">{{ t('home.nameLabel') }}</label>
        <input
          id="name"
          v-model="name"
          name="name"
          type="text"
          autocomplete="nickname"
          :maxlength="USERNAME_MAX_LENGTH"
          :placeholder="t('home.namePlaceholder')"
          class="field mt-1.5"
        />
        <p v-if="nameError" class="mt-1.5 text-sm text-red-600">{{ nameError }}</p>
      </div>

      <TabsRoot v-model="tab" class="flex flex-col gap-5">
        <TabsList class="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
          <TabsTrigger
            value="create"
            class="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 outline-red-600 outline-offset-2 focus-visible:outline-2 data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-xs"
          >
            {{ t('home.createTab') }}
          </TabsTrigger>
          <TabsTrigger
            value="join"
            class="rounded-md px-3 py-2 text-sm font-medium text-neutral-600 outline-red-600 outline-offset-2 focus-visible:outline-2 data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-xs"
          >
            {{ t('home.joinTab') }}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="create" class="flex flex-col gap-4 focus:outline-none">
          <p class="text-sm text-pretty text-neutral-600">{{ t('home.createSubtitle') }}</p>
          <button type="submit" class="btn btn-primary" :disabled="!nameValid || submitting">{{ t('home.createButton') }}</button>
        </TabsContent>

        <TabsContent value="join" class="flex flex-col gap-4 focus:outline-none">
          <p class="text-sm text-pretty text-neutral-600">{{ t('home.joinSubtitle') }}</p>
          <div>
            <label for="code" class="sr-only">{{ t('home.codeLabel') }}</label>
            <input
              id="code"
              v-model="code"
              name="code"
              type="text"
              autocomplete="off"
              autocapitalize="characters"
              :placeholder="t('home.codePlaceholder')"
              class="w-full rounded-lg bg-white px-3 py-2.5 text-center text-lg font-semibold tracking-[0.25em] text-neutral-900 uppercase ring-1 ring-neutral-950/15 outline-none placeholder:tracking-normal placeholder:text-neutral-400 focus-visible:ring-2 focus-visible:ring-red-600"
            />
          </div>
          <button type="submit" class="btn btn-primary" :disabled="!nameValid || !codeComplete || submitting">{{ t('home.joinButton') }}</button>
        </TabsContent>
      </TabsRoot>

      <p v-if="formError" class="text-center text-sm text-red-600">{{ formError }}</p>
    </form>
  </div>
</template>
