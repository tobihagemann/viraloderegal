import { computed, ref, watch } from 'vue';
import { validateUsername } from '@viraloderegal/shared';
import { useGameState } from './useGameState.js';
import { useConnection } from './useConnection.js';
import { useErrorText } from './useErrorText.js';

export function useRename() {
  const { me } = useGameState();
  const { send } = useConnection();
  const resolveError = useErrorText();

  const draft = ref(me.value?.name ?? '');
  // The server may normalize the name, so the draft follows its authoritative echo.
  watch(
    () => me.value?.name,
    (name) => {
      if (name && name !== draft.value) {
        draft.value = name;
      }
    },
  );

  const result = computed(() => validateUsername(draft.value));
  const valid = computed(() => result.value.ok);
  // An empty draft reads as mid-retype rather than as an error, so it only disables committing.
  const error = computed(() => (draft.value.length > 0 && !result.value.ok ? resolveError(result.value.error) : null));
  const changed = computed(() => result.value.ok && result.value.name !== me.value?.name);

  function save(): void {
    if (!result.value.ok || !changed.value) return;
    send({ type: 'setName', name: result.value.name });
  }

  function reset(): void {
    draft.value = me.value?.name ?? '';
  }

  return { draft, valid, error, changed, save, reset };
}
