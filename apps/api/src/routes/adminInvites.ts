import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { auth } from '../auth/auth.js';
import { ensureCredentialUser } from '../auth/credentials.js';

// better-auth's acceptInvitation requires an already-logged-in account whose email matches the invitation,
// and never creates the account or sets its password. So onboarding an invited admin is server-owned here:
// validate the invitation, provision the account via the internal adapter (signUp is disabled), sign in to
// mint a session cookie, accept the membership with that cookie, then relay the cookie to the browser.
type AcceptError = 'invalid_invitation' | 'accept_failed';

const ACCEPT_ERROR_STATUS: Record<AcceptError, ContentfulStatusCode> = {
  invalid_invitation: 410,
  accept_failed: 500,
};

const acceptInviteSchema = z.object({
  invitationId: z.string().min(1),
  password: z.string().min(8),
});

// The session cookie set by sign-in arrives as a Set-Cookie response header; the server-side acceptInvitation
// call needs it back as a Cookie request header, so reduce each Set-Cookie to its `name=value` pair.
export function toCookieHeader(setCookies: string[]): string {
  return setCookies.map((cookie) => cookie.split(';')[0]).join('; ');
}

export const adminInvites = new Hono().post('/accept', async (c) => {
  const body = acceptInviteSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) {
    return c.json({ code: 'invalid_request' }, 400);
  }
  const { invitationId, password } = body.data;
  const ctx = await auth.$context;

  const invitation = await ctx.adapter.findOne<{ email: string; status: string; expiresAt: Date }>({
    model: 'invitation',
    where: [{ field: 'id', value: invitationId }],
  });
  if (!invitation || invitation.status !== 'pending' || new Date(invitation.expiresAt).getTime() <= Date.now()) {
    return c.json({ code: 'invalid_invitation' }, ACCEPT_ERROR_STATUS.invalid_invitation);
  }

  try {
    // Provision the credential account for the invitation's email, creating the user if needed. This never
    // overwrites an existing password, so the invitation id cannot be used to take over a pre-existing account;
    // the subsequent sign-in still succeeds on a retry of a partially-failed accept (same password) and for the
    // freshly created user.
    await ensureCredentialUser(ctx, { email: invitation.email, name: invitation.email.split('@')[0] ?? invitation.email, password });

    const { headers } = await auth.api.signInEmail({ body: { email: invitation.email, password }, returnHeaders: true });
    const setCookies = headers.getSetCookie();
    await auth.api.acceptInvitation({ body: { invitationId }, headers: new Headers({ cookie: toCookieHeader(setCookies) }) });

    for (const cookie of setCookies) {
      c.header('set-cookie', cookie, { append: true });
    }
    return c.json({ ok: true }, 200);
  } catch {
    return c.json({ code: 'accept_failed' }, ACCEPT_ERROR_STATUS.accept_failed);
  }
});
