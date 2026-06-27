// The single source of the error-code vocabulary all three sides key off so REST, ws, and the SPA cannot
// drift. Split into a wire subset and a client-only subset, unioned into the display set the SPA renders:
//   - WIRE_ERROR_CODES — every code the server may emit over REST or ws; the only values errorEventSchema.code
//     accepts. Including a non-emittable code here would declare it emittable and mask accidental emissions.
//   - CLIENT_ONLY_ERROR_CODES — display codes the SPA synthesizes locally; they never cross the wire.
//   - DISPLAY_ERROR_CODES — the union the SPA renders (wire ∪ client-only).

export const WIRE_ERROR_CODES = [
  'accept_failed',
  'already_active',
  'already_joined',
  'bad_message',
  'banned',
  'clip_out_of_range',
  'config_missing',
  'empty',
  'internal',
  'internal_error',
  'invalid_chars',
  'invalid_invitation',
  'invalid_request',
  'invalid_round',
  'invalid_source',
  'invalid_token',
  'name_taken',
  'no_videos',
  'not_found',
  'not_host',
  'not_in_lobby',
  'not_intermission',
  'not_joinable',
  'not_joined',
  'not_ready',
  'not_startable',
  'quota_exhausted',
  'rate_limited',
  'reserved',
  'room_full',
  'set_incomplete',
  'set_name_taken',
  'set_not_found',
  'set_not_ready',
  'too_long',
  'too_short',
  'unauthorized',
  'video_not_found',
  'window_closed',
] as const;
export type WireErrorCode = (typeof WIRE_ERROR_CODES)[number];

export const CLIENT_ONLY_ERROR_CODES = ['generic', 'kicked', 'invalid_credentials', 'invite_failed'] as const;
export type ClientOnlyErrorCode = (typeof CLIENT_ONLY_ERROR_CODES)[number];

export const DISPLAY_ERROR_CODES = [...WIRE_ERROR_CODES, ...CLIENT_ONLY_ERROR_CODES] as const;
export type DisplayErrorCode = (typeof DISPLAY_ERROR_CODES)[number];
