import type { auth } from './auth.js';

type AuthContext = Awaited<typeof auth.$context>;

// Ensure a credential (email+password) account exists for `email`, creating the user first if absent, through
// better-auth's internal adapter — the session-free path that bypasses the disabled sign-up. It no-ops when a
// credential account already exists, so it never overwrites an existing password (the invitation id must not
// double as a password-reset token for a pre-existing account) and is safe to re-run for bootstrap repair and
// invite-accept retries. Mirrors better-auth's own credential convention: providerId 'credential', accountId
// set to the user id. Returns the user id.
export async function ensureCredentialUser(
  ctx: AuthContext,
  { email, name, password, role }: { email: string; name: string; password: string; role?: string },
): Promise<string> {
  const existing = await ctx.internalAdapter.findUserByEmail(email, { includeAccounts: true });
  if (existing) {
    const hasCredential = existing.accounts.some((account) => account.providerId === 'credential');
    if (!hasCredential) {
      const hash = await ctx.password.hash(password);
      await ctx.internalAdapter.createAccount({ userId: existing.user.id, providerId: 'credential', accountId: existing.user.id, password: hash });
    }
    return existing.user.id;
  }
  const hash = await ctx.password.hash(password);
  const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true, ...(role ? { role } : {}) });
  await ctx.internalAdapter.createAccount({ userId: user.id, providerId: 'credential', accountId: user.id, password: hash });
  return user.id;
}
