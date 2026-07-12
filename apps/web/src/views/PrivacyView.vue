<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
</script>

<template>
  <section class="flex flex-1 flex-col gap-8 py-2">
    <h1 class="text-2xl font-semibold tracking-tight text-neutral-900">{{ t('privacy.title') }}</h1>
    <div class="flex max-w-[70ch] flex-col gap-8 text-sm/6 text-neutral-600">
      <p>{{ t('privacy.intro') }}</p>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.controllerHeading') }}</h2>
        <p>
          {{ t('privacy.controller') }}
          <RouterLink class="link" :to="{ name: 'impressum' }">{{ t('impressum.title') }}</RouterLink
          >.
        </p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.hostingHeading') }}</h2>
        <p>{{ t('privacy.hosting') }}</p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.gameDataHeading') }}</h2>
        <p>{{ t('privacy.gameData') }}</p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.youtubeHeading') }}</h2>
        <p>{{ t('privacy.youtube') }}</p>
        <p>
          {{ t('privacy.youtubePolicyIntro') }}
          <a class="link" href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">{{ t('privacy.youtubePolicyLink') }}</a
          >.
        </p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.cookiesHeading') }}</h2>
        <p>{{ t('privacy.cookies') }}</p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.trackingHeading') }}</h2>
        <p>{{ t('privacy.tracking') }}</p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.rightsHeading') }}</h2>
        <p>{{ t('privacy.rights') }}</p>
      </section>
      <section class="flex flex-col gap-2">
        <h2 class="text-base font-medium text-neutral-900">{{ t('privacy.changesHeading') }}</h2>
        <p>{{ t('privacy.changes') }}</p>
      </section>
    </div>
    <p class="text-xs text-neutral-400">{{ t('privacy.updated') }}</p>
  </section>
</template>
