import { type APIRequestContext, expect, test } from '@playwright/test';
import { connect, createRoom, type EventOfType, fakeYoutubeCount, ip, waitForLobby, type WsClient } from './helpers.js';

// The bootstrap admin seeded at server boot (playwright.config.ts webServer env).
const ADMIN_EMAIL = 'admin@viraloderegal.de';
const ADMIN_PASSWORD = 'bootstrap-admin-password';

// Three seeded pool videos with their view counts, mirrored as literals so the spec does not import API
// source. Curated sets are built from these known-ready ids. Outbound YouTube calls reach the
// Playwright-controlled fake server (YOUTUBE_TRANSPORT=fake), which returns { items: [] } for unknown ids.
const SEEDED = [
  { id: 'dQw4w9WgXcQ', views: 1_600_000_000 },
  { id: '9bZkp7q19f0', views: 5_200_000_000 },
  { id: 'kJQP7kiw5Fk', views: 8_500_000_000 },
];

// Dedicated fixtures seeded by the globalSetup (tests/e2e/seed-fixtures.ts), all stale and fail-500 on the
// fake server. Ids and stored view counts mirror that script's literals.
const REFRESH_FALLBACK = { id: 'E2EFAILVC01', views: 123_456_789 };
const STALE_CONTROL = 'E2ESTALEA01';
const STALE_REPLACEMENT = 'E2ESTALEB02';

// Sign in from a distinct client IP per call to isolate better-auth's per-IP sign-in rate-limit bucket
// (3 requests/window). Without this, header-less sign-ins share the loopback bucket and rapid or parallel
// specs exhaust it; mirrors the ip() isolation the room specs already use for their rate limiters.
async function signInAdmin(request: APIRequestContext, ipLabel: string): Promise<void> {
  const res = await request.post('/api/auth/sign-in/email', { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD }, headers: ip(ipLabel) });
  expect(res.ok()).toBeTruthy();
}

interface PublicSet {
  id: string;
  name: string;
  roundCount: number;
}

async function createReadySet(request: APIRequestContext, name: string, order: string[]): Promise<string> {
  const created = await request.post('/api/admin/sets', { data: { name, description: null, videoOrder: order, enabled: true } });
  expect(created.ok()).toBeTruthy();
  const publicSets = (await (await request.get('/api/sets')).json()) as PublicSet[];
  const entry = publicSets.find((s) => s.name === name);
  expect(entry).toBeTruthy();
  return entry!.id;
}

// A host + guest who have both joined and opened the start gate, for a set-backed game.
async function readyRoom(request: APIRequestContext, hostOctet: string, guestOctet: string): Promise<{ host: WsClient; guest: WsClient }> {
  const room = await createRoom(request, 'Alice', ip(hostOctet));
  const join = await request.post('/rooms/join', { data: { code: room.code, name: 'Bob' }, headers: ip(guestOctet) });
  expect(join.status()).toBe(200);
  const guestToken = (await join.json()).sessionToken;
  const host = (await connect(room.sessionToken)).ws;
  const guest = (await connect(guestToken)).ws;
  host.send({ type: 'activateSound' });
  guest.send({ type: 'activateSound' });
  await waitForLobby(host, (lobby) => lobby.canStart);
  return { host, guest };
}

// Consume events until the next round starts or the game ends — the per-round sync point after an intermission.
async function nextRoundOrOver(ws: WsClient): Promise<EventOfType<'round'> | EventOfType<'gameOver'>> {
  for (;;) {
    const event = await ws.next();
    if (event.type === 'round' || event.type === 'gameOver') {
      return event;
    }
  }
}

test('an unauthenticated request to an admin curation route returns 401', async ({ request }) => {
  const res = await request.get('/api/admin/videos');
  expect(res.status()).toBe(401);
});

test('an admin lists the seeded video pool and can search it', async ({ request }) => {
  await signInAdmin(request, '160');
  const all = (await (await request.get('/api/admin/videos?pageSize=100')).json()) as { videos: { youtubeId: string }[]; total: number };
  expect(all.total).toBeGreaterThanOrEqual(SEEDED.length);

  const search = (await (await request.get('/api/admin/videos?q=Despacito')).json()) as { videos: { youtubeId: string }[] };
  expect(search.videos.some((v) => v.youtubeId === 'kJQP7kiw5Fk')).toBe(true);
});

test('refreshing a video whose fetch fails returns the stored snapshot as stale', async ({ request }) => {
  await signInAdmin(request, '161');
  const before = await fakeYoutubeCount(REFRESH_FALLBACK.id);
  // The fake server 500s on this fixture id → generic Error → youtubeErrorCode null → stored-snapshot fallback.
  const res = await request.post(`/api/admin/videos/${REFRESH_FALLBACK.id}/refresh`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ stale: true, snapshotRefreshedAt: null, viewCount: REFRESH_FALLBACK.views });
  // The stale fallback must follow an actual fetch attempt, not a snapshot returned without trying YouTube.
  expect((await fakeYoutubeCount(REFRESH_FALLBACK.id)) - before).toBeGreaterThanOrEqual(1);
});

test('a curated set enforces readiness and only ready, enabled sets are public', async ({ request }) => {
  await signInAdmin(request, '162');

  // A member that does not exist makes the set incomplete (the readiness rule), so it is rejected.
  const incomplete = await request.post('/api/admin/sets', {
    data: { name: `Incomplete-${Date.now()}`, description: null, videoOrder: ['00000000000'], enabled: true },
  });
  expect(incomplete.status()).toBe(422);
  expect((await incomplete.json()).code).toBe('set_incomplete');

  // A ready, enabled set appears in the public list with its round count.
  const readyName = `Ready-${Date.now()}`;
  await createReadySet(
    request,
    readyName,
    SEEDED.map((s) => s.id),
  );
  const publicSets = (await (await request.get('/api/sets')).json()) as PublicSet[];
  expect(publicSets.find((s) => s.name === readyName)?.roundCount).toBe(SEEDED.length);

  // A disabled set is omitted from the public list.
  const disabledName = `Disabled-${Date.now()}`;
  const disabled = await request.post('/api/admin/sets', {
    data: { name: disabledName, description: null, videoOrder: SEEDED.map((s) => s.id), enabled: false },
  });
  expect(disabled.ok()).toBeTruthy();
  const afterPublic = (await (await request.get('/api/sets')).json()) as PublicSet[];
  expect(afterPublic.some((s) => s.name === disabledName)).toBe(false);

  // A duplicate name is rejected with the admin-specific code.
  const duplicate = await request.post('/api/admin/sets', { data: { name: readyName, description: null, videoOrder: SEEDED.map((s) => s.id), enabled: true } });
  expect(duplicate.status()).toBe(409);
  expect((await duplicate.json()).code).toBe('set_name_taken');
});

test('a host plays a curated set in its order for exactly the set length', async ({ request }) => {
  test.setTimeout(180_000);
  await signInAdmin(request, '163');
  const order = SEEDED.map((s) => s.id);
  const setId = await createReadySet(request, `Play-${Date.now()}`, order);

  const room = await createRoom(request, 'Alice', ip('150'));
  const join = await request.post('/rooms/join', { data: { code: room.code, name: 'Bob' }, headers: ip('151') });
  expect(join.status()).toBe(200);
  const guestToken = (await join.json()).sessionToken;

  const host = (await connect(room.sessionToken)).ws;
  const guest = (await connect(guestToken)).ws;
  host.send({ type: 'activateSound' });
  guest.send({ type: 'activateSound' });
  await waitForLobby(host, (lobby) => lobby.canStart);

  // The placeholder roundsTotal (5) is ignored; the server derives the count from the set length.
  host.send({ type: 'start', settings: { source: 'set', curatedSetId: setId, roundsTotal: 5, guessTimerSec: 15 } });

  for (let i = 0; i < order.length; i++) {
    const round = await host.nextOfType('round');
    expect(round.roundNo).toBe(i + 1);
    expect(round.roundsTotal).toBe(order.length);
    expect(round.youtubeId).toBe(order[i]);
    // Consume the clip phase inserted after the prepare-phase round event, then the guess window.
    await host.nextOfType('phase');
    await host.nextOfType('phase');
    host.send({ type: 'guess', value: SEEDED[i].views, final: true });
    guest.send({ type: 'guess', value: 0, final: true });
    await host.nextOfType('reveal');
    await host.nextOfType('leaderboard');
    // The deterministic final set round (round_no === set length) auto-finishes: no intermission, straight
    // to gameOver.
    if (i < order.length - 1) {
      const inter = await host.nextOfType('phase');
      expect(inter.phase).toBe('inter');
      host.send({ type: 'skipIntermission' });
    }
  }

  const over = await host.nextOfType('gameOver');
  expect(over.rounds.map((r) => r.roundNo)).toEqual(order.map((_, i) => i + 1));

  host.close();
  guest.close();
});

test('a clip failure in a curated set draws the next member in order and ends within the set', async ({ request }) => {
  test.setTimeout(180_000);
  await signInAdmin(request, '164');
  const order = SEEDED.map((s) => s.id);
  const setId = await createReadySet(request, `Fail-${Date.now()}`, order);
  const { host, guest } = await readyRoom(request, '154', '155');

  host.send({ type: 'start', settings: { source: 'set', curatedSetId: setId, roundsTotal: 5, guessTimerSec: 15 } });
  const first = await host.nextOfType('round');
  expect(first.roundNo).toBe(1);
  expect(first.youtubeId).toBe(order[0]);

  // A clip failure draws the next set member in order, keeping the round number.
  host.send({ type: 'reportClipFailure', roundId: first.roundId });
  let round = await host.nextOfType('round');
  expect(round.roundNo).toBe(1);
  expect(round.youtubeId).toBe(order[1]);

  // Play out the rest. The failed member counts as used, so the set ends one round short of its length, and
  // the videos that actually play are the remaining members in order — never a random-pool clip.
  const played: string[] = [];
  for (;;) {
    played.push(round.youtubeId);
    // Consume the clip phase inserted after the prepare-phase round event, then the guess window.
    await host.nextOfType('phase');
    await host.nextOfType('phase');
    host.send({ type: 'guess', value: 0, final: true });
    guest.send({ type: 'guess', value: 0, final: true });
    await host.nextOfType('reveal');
    await host.nextOfType('leaderboard');
    // Mid-game pool exhaustion (round_no < rounds_total), not the deterministic final round, so the
    // intermission still runs.
    expect((await host.nextOfType('phase')).phase).toBe('inter');
    host.send({ type: 'skipIntermission' });
    const next = await nextRoundOrOver(host);
    if (next.type === 'gameOver') {
      break;
    }
    round = next;
  }
  expect(played).toEqual([order[1], order[2]]);

  host.close();
  guest.close();
});

test('a clip-failure replacement issues no outbound YouTube call even when the replacement is stale', async ({ request }) => {
  test.setTimeout(180_000);
  await signInAdmin(request, '165');
  const order = [STALE_CONTROL, STALE_REPLACEMENT];
  const setId = await createReadySet(request, `StaleFail-${Date.now()}`, order);
  const { host, guest } = await readyRoom(request, '158', '159');

  // Cumulative counters survive CI retries, so assert on per-attempt before/after deltas, never absolute counts.
  const aBefore = await fakeYoutubeCount(STALE_CONTROL);
  const bBefore = await fakeYoutubeCount(STALE_REPLACEMENT);

  host.send({ type: 'start', settings: { source: 'set', curatedSetId: setId, roundsTotal: 5, guessTimerSec: 15 } });
  const first = await host.nextOfType('round');
  expect(first.roundNo).toBe(1);
  expect(first.youtubeId).toBe(STALE_CONTROL);

  // Control: the stale round-1 clip is resolved with a fetch at game start. The fake 500s, so it stays stale
  // and this delta holds on every retry.
  expect((await fakeYoutubeCount(STALE_CONTROL)) - aBefore).toBeGreaterThanOrEqual(1);

  // A clip failure replaces for embed reasons, not staleness, so it must use the stored snapshot and fetch
  // nothing — even though the replacement is stale and a normal advance would have fetched it.
  host.send({ type: 'reportClipFailure', roundId: first.roundId });
  const replacement = await host.nextOfType('round');
  expect(replacement.roundNo).toBe(1);
  expect(replacement.youtubeId).toBe(STALE_REPLACEMENT);
  expect((await fakeYoutubeCount(STALE_REPLACEMENT)) - bBefore).toBe(0);

  host.close();
  guest.close();
});

test('deleting a curated set mid-game ends the game instead of falling back to the random pool', async ({ request }) => {
  test.setTimeout(120_000);
  await signInAdmin(request, '166');
  const order = SEEDED.map((s) => s.id);
  const setId = await createReadySet(request, `Del-${Date.now()}`, order);
  const { host, guest } = await readyRoom(request, '156', '157');

  host.send({ type: 'start', settings: { source: 'set', curatedSetId: setId, roundsTotal: 5, guessTimerSec: 15 } });
  const first = await host.nextOfType('round');
  expect(first.roundNo).toBe(1);

  // Delete the set while round 1 is in flight (games.curated_set_id is ON DELETE SET NULL). The next round's
  // selection sees a null set and ends the game rather than drawing a random clip.
  expect((await request.delete(`/api/admin/sets/${setId}`)).ok()).toBeTruthy();

  // Consume the clip phase inserted after the prepare-phase round event, then the guess window.
  await host.nextOfType('phase');
  await host.nextOfType('phase');
  host.send({ type: 'guess', value: 0, final: true });
  guest.send({ type: 'guess', value: 0, final: true });
  await host.nextOfType('reveal');
  await host.nextOfType('leaderboard');
  // The set is deleted after round 1 (round_no 1 < rounds_total), so this is mid-game exhaustion, not the
  // deterministic final round: the intermission still runs before the game ends.
  expect((await host.nextOfType('phase')).phase).toBe('inter');
  host.send({ type: 'skipIntermission' });

  const over = await host.nextOfType('gameOver');
  expect(over.rounds.map((r) => r.roundNo)).toEqual([1]);

  host.close();
  guest.close();
});

test('an admin reaches the videos workspace and sees the seeded pool', async ({ browser }) => {
  // A distinct forwarded IP isolates this UI sign-in's rate-limit bucket (see signInAdmin).
  const context = await browser.newContext({ extraHTTPHeaders: ip('168') });
  const page = await context.newPage();

  await page.goto('/admin/login');
  await page.getByLabel('E-Mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Passwort').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole('link', { name: 'Videos verwalten' }).click();
  await expect(page).toHaveURL(/\/admin\/videos$/);
  await expect(page.getByText('Despacito')).toBeVisible({ timeout: 15_000 });

  await page.getByPlaceholder('Suche nach ID, Titel oder Kanal').fill('Gangnam');
  await page.getByRole('button', { name: 'Suchen' }).click();
  await expect(page.getByText('Gangnam Style')).toBeVisible();
  await expect(page.getByText('Despacito')).toHaveCount(0);

  await context.close();
});

test('an admin builds, reorders, edits, and deletes a curated set through the UI', async ({ browser }) => {
  // A distinct forwarded IP isolates this UI sign-in's rate-limit bucket (see signInAdmin).
  const context = await browser.newContext({ extraHTTPHeaders: ip('169') });
  const page = await context.newPage();

  await page.goto('/admin/login');
  await page.getByLabel('E-Mail').fill(ADMIN_EMAIL);
  await page.getByLabel('Passwort').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.getByRole('link', { name: 'Sets verwalten' }).click();
  await expect(page).toHaveURL(/\/admin\/sets$/);

  // The picker preloads the seeded pool on mount; add two known videos, then reorder them.
  await expect(page.getByText('Despacito')).toBeVisible({ timeout: 15_000 });
  const setName = `UI-Set-${Date.now()}`;
  await page.getByLabel('Name').fill(setName);
  await page.getByRole('listitem').filter({ hasText: 'Despacito' }).getByRole('button', { name: 'Hinzufügen' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Gangnam Style' }).getByRole('button', { name: 'Hinzufügen' }).click();
  // The move buttons exist only in the ordered list, so the first one targets it unambiguously.
  await page.getByRole('button', { name: 'Nach unten' }).first().click();
  await page.getByRole('button', { name: 'Speichern' }).click();

  // The set appears in the list with its round count.
  const row = page.getByRole('listitem').filter({ hasText: setName });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText('2 Runden');

  // Editing loads the set back into the form.
  await row.getByRole('button', { name: 'Bearbeiten' }).click();
  await expect(page.getByLabel('Name')).toHaveValue(setName);

  // Deleting removes it from the list.
  await row.getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: setName })).toHaveCount(0);

  await context.close();
});

test('a host picking a curated set hides the round selector and runs the set length', async ({ browser, request }) => {
  test.setTimeout(120_000);
  await signInAdmin(request, '167');
  const setName = `UI-${Date.now()}`;
  await createReadySet(
    request,
    setName,
    SEEDED.map((s) => s.id),
  );

  const hostContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.152' } });
  const guestContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.153' } });
  await hostContext.route(/youtube(-nocookie)?\.com/, (route) => route.abort());
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await host.goto('/');
  await host.getByLabel('Dein Name').fill('Alice');
  await host.getByRole('button', { name: 'Raum erstellen' }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop() ?? '';

  await guest.goto('/');
  await guest.getByLabel('Dein Name').fill('Bob');
  await guest.getByRole('tab', { name: 'Beitreten' }).click();
  await guest.getByPlaceholder('ABC123').fill(code);
  await guest.getByRole('button', { name: 'Beitreten' }).click();
  await expect(host.getByText('Bob')).toBeVisible({ timeout: 15_000 });

  // The round selector shows for the default random source; choosing the set hides it (round count = set
  // length). reka-ui labels the source trigger with its aria-label "Quelle".
  await expect(host.locator('[aria-label="Runden"]')).toBeVisible();
  await host.locator('[aria-label="Quelle"]').click();
  await host.getByRole('option', { name: setName, exact: true }).click();
  await expect(host.locator('[aria-label="Runden"]')).toHaveCount(0);

  const start = host.getByRole('button', { name: 'Spiel starten' });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();

  // The round indicator carries the set length as the total, confirming the server overrode the placeholder.
  await expect(host.getByText(`Runde 1 von ${SEEDED.length}`)).toBeVisible({ timeout: 60_000 });

  await hostContext.close();
  await guestContext.close();
});
