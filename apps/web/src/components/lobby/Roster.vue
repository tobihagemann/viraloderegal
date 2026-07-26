<script setup lang="ts">
import { nextTick, ref } from 'vue';
import { CheckIcon, PencilSquareIcon, XMarkIcon } from '@heroicons/vue/16/solid';
import { useI18n } from 'vue-i18n';
import { USERNAME_MAX_LENGTH } from '@viraloderegal/shared';
import { useGameState } from '../../composables/useGameState.js';
import { useRename } from '../../composables/useRename.js';

const { store } = useGameState();
const { t } = useI18n();
const { draft, valid, error, changed, save, reset } = useRename();

const editing = ref(false);
// A string ref inside v-for collects into an array; only one row is ever editable, so a function ref keeps
// hold of that single input directly.
let input: HTMLInputElement | null = null;

function setInput(el: unknown): void {
  input = (el as HTMLInputElement | null) ?? null;
}

async function startEdit(): Promise<void> {
  reset();
  editing.value = true;
  await nextTick();
  input?.select();
}

// An invalid draft keeps the editor open so its message stays on screen.
function commit(): void {
  if (!valid.value) {
    return;
  }
  if (changed.value) {
    save();
  }
  editing.value = false;
}

function cancel(): void {
  reset();
  editing.value = false;
}
</script>

<template>
  <ul role="list" class="divide-y divide-neutral-950/5">
    <li v-for="player in store.lobby?.players ?? []" :key="player.id" class="py-3 first:pt-0 last:pb-0">
      <!-- The row reserves the height of the rename input so switching into and out of edit mode doesn't shift
           everything below it. -->
      <div class="flex min-h-11 items-center gap-3 sm:min-h-9">
        <span
          class="size-2 shrink-0 rounded-full"
          :class="player.connected ? 'bg-emerald-500' : 'bg-neutral-300'"
          :title="player.connected ? '' : t('lobby.disconnected')"
          aria-hidden="true"
        ></span>

        <template v-if="player.id === store.you && editing">
          <input
            :ref="setInput"
            v-model="draft"
            name="rename"
            type="text"
            autocomplete="nickname"
            :maxlength="USERNAME_MAX_LENGTH"
            :aria-label="t('rename.label')"
            class="field min-w-0 flex-1"
            @keyup.enter="commit"
            @keyup.esc="cancel"
          />
          <span class="flex shrink-0 items-center gap-1">
            <button type="button" class="icon-btn icon-btn-accent" :disabled="!valid" :aria-label="t('rename.save')" :title="t('rename.save')" @click="commit">
              <CheckIcon class="size-4" />
            </button>
            <button type="button" class="icon-btn icon-btn-neutral" :aria-label="t('common.cancel')" :title="t('common.cancel')" @click="cancel">
              <XMarkIcon class="size-4" />
            </button>
          </span>
        </template>

        <template v-else>
          <p class="min-w-0 flex-1 truncate text-base font-medium text-neutral-800">
            {{ player.name }}
            <span v-if="player.id === store.you" class="font-normal text-neutral-400">({{ t('common.you') }})</span>
          </p>
          <button
            v-if="player.id === store.you"
            type="button"
            class="icon-btn icon-btn-neutral shrink-0"
            :aria-label="t('rename.label')"
            :title="t('rename.label')"
            @click="startEdit"
          >
            <PencilSquareIcon class="size-4" />
          </button>
          <span v-if="player.isHost" class="inline-flex shrink-0 items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
            {{ t('lobby.hostBadge') }}
          </span>
        </template>
      </div>

      <p v-if="player.id === store.you && editing && error" class="mt-1.5 text-sm text-red-600">{{ error }}</p>
    </li>
  </ul>
</template>
