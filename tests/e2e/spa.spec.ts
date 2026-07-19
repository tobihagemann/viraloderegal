import { type BrowserContext, expect, type Page, test } from '@playwright/test';

// Distinct fake client IPs isolate the per-IP REST rate-limit buckets, mirroring the raw-protocol helpers.
// The browser drives the SPA end to end; the clip phase advances on the server's own timer, so the flow
// does not depend on YouTube playback.

// Block YouTube so the embedded player never initializes. Otherwise a region where the seeded clips are
// non-embeddable makes the host's player error, which triggers reportClipFailure and swaps clips until the
// pool is exhausted (ending the game before a guess phase). With the player gone, the clip phase advances
// purely on the server timer, keeping this UI flow deterministic across environments.
async function blockYouTube(context: BrowserContext): Promise<void> {
  await context.route(/youtube(-nocookie)?\.com/, (route) => route.abort());
}

async function setSelect(page: Page, ariaLabel: string, optionText: string): Promise<void> {
  await page.locator(`[aria-label="${ariaLabel}"]`).click();
  await page.getByRole('option', { name: optionText, exact: true }).click();
}

async function playRound(host: Page, guest: Page, isFinal: boolean): Promise<void> {
  // The guess input appears once the server advances prepare → clip → guess (independent of clip playback).
  // Typing drafts the value; "Tipp abgeben" commits it and marks the player ready.
  const hostGuess = host.getByLabel('Aufrufe');
  await expect(hostGuess).toBeVisible({ timeout: 60_000 });
  await hostGuess.fill('1000000000');
  await host.getByRole('button', { name: 'Tipp abgeben' }).click();

  const guestGuess = guest.getByLabel('Aufrufe');
  await expect(guestGuess).toBeVisible({ timeout: 60_000 });
  await guestGuess.fill('100');
  await guest.getByRole('button', { name: 'Tipp abgeben' }).click();

  // Once both have committed the server ends the window early. The deterministic final round auto-finishes
  // straight to the end screen; earlier rounds pause on the "Weiter" control (the intermission's long window
  // makes it the stable per-round sync point), which the host clicks to advance.
  if (!isFinal) {
    const next = host.getByRole('button', { name: 'Weiter' });
    await expect(next).toBeVisible({ timeout: 60_000 });
    await next.click();
  }
}

test('host and guest play a full game through the UI and start a rematch', async ({ browser }) => {
  test.setTimeout(300_000);
  const hostContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.140' } });
  const guestContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.141' } });
  await blockYouTube(hostContext);
  await blockYouTube(guestContext);
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  // Host creates a room and lands in its lobby. The start screen defaults to the join tab, so switch to create first.
  await host.goto('/');
  await host.getByLabel('Dein Name').fill('Alice');
  await host.getByRole('tab', { name: 'Erstellen' }).click();
  await host.getByRole('button', { name: 'Raum erstellen' }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
  const code = host.url().split('/').pop() ?? '';
  expect(code).toHaveLength(6);

  // Guest joins by code: switch to the join tab, then enter the code.
  await guest.goto('/');
  await guest.getByLabel('Dein Name').fill('Bob');
  await guest.getByRole('tab', { name: 'Beitreten' }).click();
  await guest.getByPlaceholder('ABC123').fill(code);
  await guest.getByRole('button', { name: 'Beitreten' }).click();
  await expect(guest).toHaveURL(new RegExp(`/room/${code}$`));

  // Both players appear in the host's roster, which opens the start gate (no sound activation required).
  await expect(host.getByText('Alice')).toBeVisible();
  await expect(host.getByText('Bob')).toBeVisible({ timeout: 15_000 });

  // Host configures the shortest game and starts it.
  await setSelect(host, 'Runden', '3');
  await setSelect(host, 'Rate-Zeit', '15 Sek.');
  const start = host.getByRole('button', { name: 'Spiel starten' });
  await expect(start).toBeEnabled({ timeout: 15_000 });
  await start.click();

  for (let round = 1; round <= 3; round++) {
    await playRound(host, guest, round === 3);
  }

  // End screen with the per-round history, then a rematch.
  await expect(host.getByText('Spiel beendet')).toBeVisible({ timeout: 30_000 });
  await expect(host.getByRole('heading', { name: 'Runden im Überblick' })).toBeVisible();
  const rematch = host.getByRole('button', { name: 'Revanche' });
  await expect(rematch).toBeEnabled({ timeout: 15_000 });
  await rematch.click();

  // The incoming round transitions everyone back into the game. The rematch uses the end screen's own
  // (default) round count, so match the round indicator without pinning the total.
  await expect(guest.getByText(/Runde 1 von \d/)).toBeVisible({ timeout: 60_000 });

  await hostContext.close();
  await guestContext.close();
});

test('a rejected session token is cleared and returns the player to the home screen', async ({ browser }) => {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.142' } });
  const page = await context.newPage();

  // Seed a bogus token for a room code, then open that room. The server rejects the token, so the client
  // must drop it and route home with the reason shown.
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('vor:token:ZZZZZZ', 'not-a-real-token'));
  await page.goto('/room/ZZZZZZ');

  await expect(page.getByText('Deine Sitzung ist ungültig. Bitte tritt erneut bei.')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/$/);
  expect(await page.evaluate(() => localStorage.getItem('vor:token:ZZZZZZ'))).toBeNull();

  await context.close();
});
