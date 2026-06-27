import { expect, test } from '@playwright/test';

// The bootstrap admin seeded at server boot (playwright.config.ts webServer env). The invite flow runs with
// MAIL_TRANSPORT=json so no mail server is needed; the invitation id is read from better-auth's API response.
const ADMIN_EMAIL = 'admin@viraloderegal.de';
const ADMIN_PASSWORD = 'bootstrap-admin-password';

const DAY_MS = 24 * 60 * 60 * 1000;

// better-auth's mutating org endpoints enforce a same-origin check that the browser sets automatically but
// the API request fixture does not, so the invite call passes it explicitly. It must match BETTER_AUTH_URL.
const ORIGIN = `http://localhost:${process.env.E2E_PORT ?? '3000'}`;

test('unauthenticated access to /admin redirects to the login', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('button', { name: 'Anmelden' })).toBeVisible();

  await context.close();
});

test('self-signup is rejected', async ({ request }) => {
  const res = await request.post('/api/auth/sign-up/email', {
    data: { email: 'intruder@viraloderegal.de', password: 'intruder-password', name: 'Intruder' },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('the bootstrap admin signs in and reaches the workspace', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/admin/login');
  await page.getByLabel('E-Mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Passwort').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();

  // The SPA redirects to /admin only after the CPU-bound better-auth sign-in POST resolves, which can
  // exceed Playwright's 5s default under CI load.
  await expect(page.getByText(`Angemeldet als ${ADMIN_EMAIL}`)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/admin$/);

  await context.close();
});

test('a wrong password keeps the admin on the login with a localized error', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/admin/login');
  await page.getByLabel('E-Mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Passwort').fill('wrong-password');
  await page.getByRole('button', { name: 'Anmelden' }).click();

  await expect(page.getByText('E-Mail oder Passwort ist falsch.')).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/login$/);

  await context.close();
});

test('the invite-accept endpoint rejects a bogus id and a too-short password', async ({ request }) => {
  const bogus = await request.post('/admin/invites/accept', { data: { invitationId: 'does-not-exist', password: 'long-enough-password' } });
  expect(bogus.status()).toBe(410);

  const shortPassword = await request.post('/admin/invites/accept', { data: { invitationId: 'does-not-exist', password: 'short' } });
  expect(shortPassword.status()).toBe(400);
});

test('an invited admin sets a password on first login and reaches the workspace', async ({ browser, request }) => {
  // Create the invitation through better-auth's API as the bootstrap admin, capturing its id and expiry.
  const signIn = await request.post('/api/auth/sign-in/email', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(signIn.ok()).toBeTruthy();
  const organizations = (await (await request.get('/api/auth/organization/list')).json()) as { id: string }[];
  const organizationId = organizations[0]?.id;
  expect(organizationId).toBeTruthy();

  const invitee = `colleague-${Date.now()}@viraloderegal.de`;
  const inviteRes = await request.post('/api/auth/organization/invite-member', {
    data: { email: invitee, role: 'member', organizationId },
    headers: { origin: ORIGIN },
  });
  expect(inviteRes.ok()).toBeTruthy();
  const invitation = (await inviteRes.json()) as { id: string; expiresAt: string };
  expect(invitation.id).toBeTruthy();

  // 24 h expiry: comfortably under a day, comfortably over 23 h.
  const ttl = new Date(invitation.expiresAt).getTime() - Date.now();
  expect(ttl).toBeGreaterThan(DAY_MS - 60 * 60 * 1000);
  expect(ttl).toBeLessThanOrEqual(DAY_MS);

  // The invited user accepts via the set-password form in a fresh context (no prior session).
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/admin/accept-invite/${invitation.id}`);
  await page.getByLabel('Passwort').fill('invited-password');
  await page.getByRole('button', { name: 'Passwort festlegen und beitreten' }).click();

  await expect(page.getByText(`Angemeldet als ${invitee}`)).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/admin$/);

  await context.close();
});
