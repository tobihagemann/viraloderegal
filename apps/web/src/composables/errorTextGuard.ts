import type { DisplayErrorCode } from '@viraloderegal/shared';
import { de } from '../locales/de.js';

// The i18n namespaces that hold error messages, in resolution order. Single-sourced here so the runtime lookup
// in useErrorText and the compile-time coverage check below cannot diverge: useErrorText iterates this list and
// MessagedCode is derived from it, so this guard certifies exactly the namespaces the lookup actually scans.
export const ERROR_NAMESPACES = ['error', 'usernameError', 'adminError'] as const;
type ErrorNamespace = (typeof ERROR_NAMESPACES)[number];

// Wire codes deliberately rendered with the generic German message instead of a bespoke one, so the coverage
// assertion below treats their missing message as reviewed intent rather than an oversight. `StrayAllowListEntry`
// keeps each member checked against the vocabulary — a typo'd or non-display code here is a compile error.
type IntentionallyGenericErrorCode =
  | 'already_joined'
  | 'bad_message'
  | 'internal'
  | 'invalid_round'
  | 'invalid_source'
  | 'not_in_lobby'
  | 'not_intermission'
  | 'not_joined'
  | 'not_ready'
  | 'not_startable';

// Every DisplayErrorCode must resolve to a real message: a key of one of the message namespaces, or an
// allow-listed generic code. A code added without a message and not allow-listed makes `Uncovered` non-empty;
// a stray allow-list entry outside the vocabulary makes `StrayAllowListEntry` non-empty — either fails this
// assertion under vue-tsc (the merge gate's web typecheck/build).
type MessagedCode = { [K in ErrorNamespace]: keyof (typeof de)[K] }[ErrorNamespace];
type Uncovered = Exclude<DisplayErrorCode, MessagedCode | IntentionallyGenericErrorCode>;
type StrayAllowListEntry = Exclude<IntentionallyGenericErrorCode, DisplayErrorCode>;
type Expect<T extends true> = T;
type AssertErrorCodeCoverage = Expect<[Uncovered] extends [never] ? true : false> & Expect<[StrayAllowListEntry] extends [never] ? true : false>;

// The assertion bites at the `Expect<false>` instantiations above when a code is uncovered or strayed; this
// statement only references the type so it isn't an unused declaration.
true satisfies AssertErrorCodeCoverage;
