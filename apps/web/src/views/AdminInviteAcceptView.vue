<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { errorCode, useErrorText } from '../composables/useErrorText.js';

const MIN_PASSWORD_LENGTH = 8;

const props = defineProps<{ invitationId: string }>();
const router = useRouter();
const { t } = useI18n();
const resolveError = useErrorText();

const password = ref('');
const submitting = ref(false);
const formError = ref<string | null>(null);

const passwordValid = computed(() => password.value.length >= MIN_PASSWORD_LENGTH);

async function onSubmit(): Promise<void> {
  if (!passwordValid.value || submitting.value) return;
  submitting.value = true;
  formError.value = null;
  try {
    const response = await fetch('/admin/invites/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ invitationId: props.invitationId, password: password.value }),
    });
    if (response.ok) {
      void router.push({ name: 'admin' });
      return;
    }
    const data = await response.json().catch(() => null);
    formError.value = resolveError(errorCode(data));
  } catch {
    formError.value = resolveError('generic');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-8">
    <div class="text-center">
      <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{{ t('adminInvite.heading') }}</h1>
      <p class="mx-auto mt-3 max-w-[40ch] text-base text-pretty text-neutral-600">{{ t('adminInvite.subtitle') }}</p>
    </div>

    <form class="flex flex-col gap-5" @submit.prevent="onSubmit">
      <div>
        <label for="password" class="block text-sm font-medium text-neutral-700">{{ t('adminInvite.passwordLabel') }}</label>
        <input id="password" v-model="password" name="password" type="password" autocomplete="new-password" class="field mt-1.5" />
        <p class="mt-1.5 text-sm text-neutral-600">{{ t('adminInvite.passwordHint') }}</p>
      </div>
      <button type="submit" class="btn btn-primary" :disabled="!passwordValid || submitting">{{ t('adminInvite.submit') }}</button>
      <p v-if="formError" class="text-center text-sm text-red-600">{{ formError }}</p>
    </form>
  </div>
</template>
