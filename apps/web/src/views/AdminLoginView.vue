<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { authClient } from '../auth/client.js';
import { useErrorText } from '../composables/useErrorText.js';

const router = useRouter();
const { t } = useI18n();
const resolveError = useErrorText();

const email = ref('');
const password = ref('');
const submitting = ref(false);
const formError = ref<string | null>(null);

async function onSubmit(): Promise<void> {
  if (submitting.value) return;
  submitting.value = true;
  formError.value = null;
  try {
    const { error } = await authClient.signIn.email({ email: email.value, password: password.value });
    if (error) {
      formError.value = resolveError('invalid_credentials');
      return;
    }
    void router.push({ name: 'admin' });
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
      <h1 class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{{ t('adminLogin.heading') }}</h1>
      <p class="mx-auto mt-3 max-w-[40ch] text-base text-pretty text-neutral-600">{{ t('adminLogin.subtitle') }}</p>
    </div>

    <form class="flex flex-col gap-5" @submit.prevent="onSubmit">
      <div>
        <label for="email" class="block text-sm font-medium text-neutral-700">{{ t('adminLogin.emailLabel') }}</label>
        <input
          id="email"
          v-model="email"
          name="email"
          type="email"
          autocomplete="username"
          :placeholder="t('adminLogin.emailPlaceholder')"
          class="field mt-1.5"
        />
      </div>
      <div>
        <label for="password" class="block text-sm font-medium text-neutral-700">{{ t('adminLogin.passwordLabel') }}</label>
        <input id="password" v-model="password" name="password" type="password" autocomplete="current-password" class="field mt-1.5" />
      </div>
      <button type="submit" class="btn btn-primary" :disabled="!email || !password || submitting">{{ t('adminLogin.submit') }}</button>
      <p v-if="formError" class="text-center text-sm text-red-600">{{ formError }}</p>
    </form>
  </div>
</template>
