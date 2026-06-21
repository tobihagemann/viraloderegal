<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { USERNAME_MAX_LENGTH, validateUsername } from '@viraloderegal/shared';
import { useGameState } from '../../composables/useGameState.js';
import { useConnection } from '../../composables/useConnection.js';
import { useErrorText } from '../../composables/useErrorText.js';

const { me } = useGameState();
const { send } = useConnection();
const { t } = useI18n();
const resolveError = useErrorText();

const draft = ref(me.value?.name ?? '');
// Follow the server's authoritative roster echo: a successful rename (or a server-side normalization) updates
// the field to match.
watch(
  () => me.value?.name,
  (name) => {
    if (name && name !== draft.value) {
      draft.value = name;
    }
  },
);

const result = computed(() => validateUsername(draft.value));
const error = computed(() => (draft.value.length > 0 && !result.value.ok ? resolveError(result.value.error) : null));
const changed = computed(() => result.value.ok && result.value.name !== me.value?.name);

function save(): void {
  if (!result.value.ok || !changed.value) return;
  send({ type: 'setName', name: result.value.name });
}
</script>

<template>
  <form @submit.prevent="save">
    <label for="rename" class="block text-sm font-medium text-neutral-700">{{ t('rename.label') }}</label>
    <div class="mt-1.5 flex gap-2">
      <input id="rename" v-model="draft" name="rename" type="text" autocomplete="nickname" :maxlength="USERNAME_MAX_LENGTH" class="field min-w-0 flex-1" />
      <button type="submit" class="btn btn-secondary shrink-0" :disabled="!changed">{{ t('rename.save') }}</button>
    </div>
    <p v-if="error" class="mt-1.5 text-sm text-red-600">{{ error }}</p>
  </form>
</template>
