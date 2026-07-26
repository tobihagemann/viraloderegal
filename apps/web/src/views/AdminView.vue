<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowRightIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { authClient } from '../auth/client.js';
import { useErrorText } from '../composables/useErrorText.js';

const router = useRouter();
const { t } = useI18n();
const resolveError = useErrorText();
const session = authClient.useSession();

// Resolve the admin's organization explicitly rather than relying on a pre-seeded active organization:
// activeOrganizationId is session state the seed cannot set for future logins, so the invite passes
// organizationId itself.
const organizationId = ref<string | null>(null);
const inviteEmail = ref('');
const submitting = ref(false);
const inviteError = ref<string | null>(null);
const inviteSent = ref<string | null>(null);

onMounted(async () => {
  const { data } = await authClient.organization.list();
  organizationId.value = data?.[0]?.id ?? null;
});

async function onInvite(): Promise<void> {
  if (!organizationId.value || !inviteEmail.value || submitting.value) return;
  submitting.value = true;
  inviteError.value = null;
  inviteSent.value = null;
  try {
    const { error } = await authClient.organization.inviteMember({ email: inviteEmail.value, role: 'member', organizationId: organizationId.value });
    if (error) {
      inviteError.value = resolveError('invite_failed');
      return;
    }
    inviteSent.value = t('admin.inviteSent', { email: inviteEmail.value });
    inviteEmail.value = '';
  } catch {
    inviteError.value = resolveError('invite_failed');
  } finally {
    submitting.value = false;
  }
}

async function onSignOut(): Promise<void> {
  await authClient.signOut();
  void router.push({ name: 'adminLogin' });
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-8">
    <div class="flex items-start justify-between gap-4">
      <div class="min-w-0">
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('admin.heading') }}</h1>
        <p class="mt-1 text-sm text-neutral-600">{{ t('admin.greeting', { email: session.data?.user.email ?? '' }) }}</p>
      </div>
      <button type="button" class="btn btn-secondary shrink-0" @click="onSignOut">{{ t('admin.signOut') }}</button>
    </div>

    <nav class="grid gap-4 sm:grid-cols-2">
      <RouterLink
        :to="{ name: 'adminVideos' }"
        class="card flex flex-col gap-1 outline-red-600 outline-offset-2 hover:ring-neutral-950/20 focus-visible:outline-2"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-neutral-900">{{ t('adminNav.videos') }}</h2>
          <ArrowRightIcon class="size-4 shrink-0 text-neutral-400" />
        </div>
        <p class="text-sm text-pretty text-neutral-600">{{ t('adminNav.videosDescription') }}</p>
      </RouterLink>
      <RouterLink
        :to="{ name: 'adminSets' }"
        class="card flex flex-col gap-1 outline-red-600 outline-offset-2 hover:ring-neutral-950/20 focus-visible:outline-2"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-neutral-900">{{ t('adminNav.sets') }}</h2>
          <ArrowRightIcon class="size-4 shrink-0 text-neutral-400" />
        </div>
        <p class="text-sm text-pretty text-neutral-600">{{ t('adminNav.setsDescription') }}</p>
      </RouterLink>
    </nav>

    <section class="flex flex-col gap-4 border-t border-neutral-950/10 pt-8">
      <div>
        <h2 class="text-lg font-medium">{{ t('admin.teamHeading') }}</h2>
        <p class="mt-1 text-sm text-pretty text-neutral-600">{{ t('admin.teamSubtitle') }}</p>
      </div>
      <form class="flex flex-col gap-3 sm:flex-row sm:items-end" @submit.prevent="onInvite">
        <div class="min-w-0 flex-1">
          <label for="invite-email" class="block text-sm font-medium text-neutral-700">{{ t('admin.inviteEmailLabel') }}</label>
          <input
            id="invite-email"
            v-model="inviteEmail"
            name="invite-email"
            type="email"
            autocomplete="off"
            :placeholder="t('admin.inviteEmailPlaceholder')"
            class="field mt-1.5"
          />
        </div>
        <button type="submit" class="btn btn-secondary shrink-0" :disabled="!organizationId || !inviteEmail || submitting">
          {{ t('admin.inviteSubmit') }}
        </button>
      </form>
      <p v-if="inviteSent" class="text-sm text-neutral-600">{{ inviteSent }}</p>
      <p v-if="inviteError" class="text-sm text-red-600">{{ inviteError }}</p>
    </section>
  </div>
</template>
