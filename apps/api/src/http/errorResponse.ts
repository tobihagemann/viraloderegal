import type { WireErrorCode } from '@viraloderegal/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// The single emission point for the REST `{ code }` error contract. Typing `code` as WireErrorCode makes a
// non-emittable code a compile error at every call site, so REST cannot drift from the shared vocabulary the
// ws transport and the SPA key off. Bodies carrying extra fields (e.g. set_incomplete's video list) annotate
// the literal with `satisfies WireErrorCode` instead.
export function errorJson(c: Context, code: WireErrorCode, status: ContentfulStatusCode) {
  return c.json({ code }, status);
}
