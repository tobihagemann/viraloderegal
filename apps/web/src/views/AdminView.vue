<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
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
  <div class="mx-auto flex w-full max-w-md flex-col gap-8">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">{{ t('admin.heading') }}</h1>
        <p class="mt-1 text-sm text-neutral-600">{{ t('admin.greeting', { email: session.data?.user.email ?? '' }) }}</p>
      </div>
      <button type="button" class="btn btn-secondary" @click="onSignOut">{{ t('admin.signOut') }}</button>
    </div>

    <nav class="flex flex-col gap-2">
      <RouterLink :to="{ name: 'adminVideos' }" class="btn btn-secondary justify-between"
        >{{ t('adminNav.videos') }}<span aria-hidden="true">→</span></RouterLink
      >
      <RouterLink :to="{ name: 'adminSets' }" class="btn btn-secondary justify-between">{{ t('adminNav.sets') }}<span aria-hidden="true">→</span></RouterLink>
    </nav>

    <form class="flex flex-col gap-4" @submit.prevent="onInvite">
      <h2 class="text-lg font-medium">{{ t('admin.inviteHeading') }}</h2>
      <div>
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
      <button type="submit" class="btn btn-primary" :disabled="!organizationId || !inviteEmail || submitting">{{ t('admin.inviteSubmit') }}</button>
      <p v-if="inviteSent" class="text-center text-sm text-neutral-600">{{ inviteSent }}</p>
      <p v-if="inviteError" class="text-center text-sm text-red-600">{{ inviteError }}</p>
    </form>
  </div>
</template>
