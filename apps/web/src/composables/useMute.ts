import type { Ref } from 'vue';
import { useStoredFlag } from './useStorage.js';

// One shared mute flag for the whole app: the toggle in the shell and the clip player read and write the
// same ref, and it persists across reloads. Muted-by-default so a reload never blasts audio unexpectedly.
const muted = useStoredFlag('vor:muted', true);

export function useMute(): Ref<boolean> {
  return muted;
}
