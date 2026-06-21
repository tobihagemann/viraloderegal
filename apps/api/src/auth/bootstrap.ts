import { env } from '../env.js';
import { auth } from './auth.js';
import { ensureCredentialUser } from './credentials.js';

const ORGANIZATION_NAME = 'Viral oder Egal';
const ORGANIZATION_SLUG = 'viraloderegal';

// Seed the bootstrap admin, default organization, and owner membership idempotently, so a deploy always has
// an admin who can sign in and invite the rest. Each step no-ops if its row already exists, and the credential
// account is reconciled separately from the user so a half-finished prior boot (user created, credential not)
// is repaired rather than leaving an admin who cannot sign in. There is no admin session at deploy time and
// `disableSignUp` blocks server-side sign-up, so the account is created through better-auth's internal adapter
// (session-free, not subject to the sign-up gate); the org/membership rows go through the generic adapter.
// Invitations are org-scoped, so the org and an owner member must exist before the admin can issue any.
export async function seedBootstrap(): Promise<void> {
  const ctx = await auth.$context;

  const userId = await ensureCredentialUser(ctx, {
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    name: 'Admin',
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    role: 'superadmin',
  });

  let org = await ctx.adapter.findOne<{ id: string }>({ model: 'organization', where: [{ field: 'slug', value: ORGANIZATION_SLUG }] });
  if (!org) {
    org = await ctx.adapter.create<{ name: string; slug: string; createdAt: Date }, { id: string }>({
      model: 'organization',
      data: { name: ORGANIZATION_NAME, slug: ORGANIZATION_SLUG, createdAt: new Date() },
    });
  }

  const member = await ctx.adapter.findOne<{ id: string }>({
    model: 'member',
    where: [
      { field: 'organizationId', value: org.id },
      { field: 'userId', value: userId },
    ],
  });
  if (!member) {
    await ctx.adapter.create({
      model: 'member',
      data: { organizationId: org.id, userId, role: 'owner', createdAt: new Date() },
    });
  }
}
