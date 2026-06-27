import { expect, test } from '@playwright/test';
import { type APIRequestContext } from '@playwright/test';
import { connect, createRoom, type EventOfType, ip, openWs, waitForLobby, type WsClient } from './helpers.js';

// View counts of the seeded random pool, mirrored as literals so the spec does not import API source. The
// host guesses a round's exact count to become its sole winner deterministically.
const VIEW_COUNTS: Record<string, number> = {
  dQw4w9WgXcQ: 1_600_000_000,
  '9bZkp7q19f0': 5_200_000_000,
  kJQP7kiw5Fk: 8_500_000_000,
  OPf0YbXqDm0: 5_000_000_000,
  JGwWNGJdvx8: 6_200_000_000,
  hT_nvWreIhg: 4_100_000_000,
  CevxZvSJLk8: 3_900_000_000,
  fJ9rUzIMcZQ: 1_800_000_000,
};

// Seeded titles per youtubeId, mirrored as literals (the spec does not import API source). The title is part
// of the revealed answer — withheld until the reveal — so the reveal event carries it while the round event
// must not.
const EXPECTED_TITLES: Record<string, string> = {
  dQw4w9WgXcQ: 'Never Gonna Give You Up',
  '9bZkp7q19f0': 'Gangnam Style',
  kJQP7kiw5Fk: 'Despacito',
  OPf0YbXqDm0: 'Uptown Funk',
  JGwWNGJdvx8: 'Shape of You',
  hT_nvWreIhg: 'Counting Stars',
  CevxZvSJLk8: 'Roar',
  fJ9rUzIMcZQ: 'Bohemian Rhapsody',
};

const GAME_SETTINGS = { source: 'random', roundsTotal: 3, guessTimerSec: 15 } as const;

interface ReadyRoom {
  host: WsClient;
  guest: WsClient;
  hostToken: string;
}

// A host + guest who have both joined and activated sound, so the start-gate is open. The two octets must
// be valid and distinct so each player lands in its own per-IP bucket.
async function readyRoom(request: APIRequestContext, hostOctet: string, guestOctet: string): Promise<ReadyRoom> {
  const room = await createRoom(request, 'Alice', ip(hostOctet));
  const join = await request.post('/rooms/join', { data: { code: room.code, name: 'Bob' }, headers: ip(guestOctet) });
  expect(join.status()).toBe(200);
  const guestToken = (await join.json()).sessionToken;

  const host = (await connect(room.sessionToken)).ws;
  const guest = (await connect(guestToken)).ws;
  host.send({ type: 'activateSound' });
  guest.send({ type: 'activateSound' });
  await waitForLobby(host, (lobby) => lobby.canStart);
  return { host, guest, hostToken: room.sessionToken };
}

// Drive a started game to its end screen, the host winning every round (the guest guesses far off), and
// return the gameOver event. Intermissions are skipped to keep the run short.
async function playToGameOver(host: WsClient, guest: WsClient, rounds: number): Promise<EventOfType<'gameOver'>> {
  for (let roundNo = 1; roundNo <= rounds; roundNo++) {
    const round = await host.nextOfType('round');
    await host.nextOfType('phase');
    // Commit final guesses so the guess window ends on the early-advance instead of running its full timer,
    // keeping the multi-round run well under the test budget.
    host.send({ type: 'guess', value: VIEW_COUNTS[round.youtubeId], final: true });
    guest.send({ type: 'guess', value: 0, final: true });
    await host.nextOfType('reveal');
    await host.nextOfType('leaderboard');
    const interPhase = await host.nextOfType('phase');
    expect(interPhase.phase).toBe('inter');
    host.send({ type: 'skipIntermission' });
  }
  return host.nextOfType('gameOver');
}

test('a full game runs through clip, guess, reveal, leaderboard, and a final game over', async ({ request }) => {
  test.setTimeout(180_000);
  const { host, guest } = await readyRoom(request, '120', '121');

  host.send({ type: 'start', settings: GAME_SETTINGS });

  for (let roundNo = 1; roundNo <= 3; roundNo++) {
    const round = await host.nextOfType('round');
    expect(round.roundNo).toBe(roundNo);
    expect(round.roundsTotal).toBe(3);
    // Anti-cheat: the clip-phase round event must not carry the title, or players could look up the answer.
    expect('title' in round).toBe(false);

    const guessPhase = await host.nextOfType('phase');
    expect(guessPhase.phase).toBe('guess');
    // Monotonic deadlines: the guess window closes after the clip ends.
    expect(new Date(guessPhase.phaseEndAt).getTime()).toBeGreaterThan(new Date(round.phaseEndAt).getTime());

    const trueCount = VIEW_COUNTS[round.youtubeId];
    host.send({ type: 'guess', value: trueCount });
    // Round 2 exercises the non-submitter path: the guest sends no guess and is scored null / 0.
    if (roundNo !== 2) {
      guest.send({ type: 'guess', value: 0 });
    }

    const reveal = await host.nextOfType('reveal');
    expect(reveal.viewCount).toBe(trueCount);
    expect(reveal.title).toBe(EXPECTED_TITLES[round.youtubeId]);
    expect(reveal.results).toHaveLength(2);
    expect(reveal.results.filter((r) => r.isWinner)).toHaveLength(1);
    expect(reveal.results.find((r) => r.isWinner)?.playerName).toBe('Alice');
    if (roundNo === 2) {
      const bob = reveal.results.find((r) => r.playerName === 'Bob');
      expect(bob?.guess).toBeNull();
      expect(bob?.distance).toBeNull();
      expect(bob?.points).toBe(0);
    }

    if (roundNo === 1) {
      // A guess after the window closed (the round is now revealing) is rejected.
      guest.send({ type: 'guess', value: 123 });
      expect((await guest.nextOfType('error')).code).toBe('window_closed');
    }

    const leaderboard = await host.nextOfType('leaderboard');
    expect(leaderboard.standings.find((s) => s.playerName === 'Alice')?.totalPoints).toBe(roundNo);
    expect(leaderboard.standings.find((s) => s.playerName === 'Alice')?.rank).toBe(1);

    const interPhase = await host.nextOfType('phase');
    expect(interPhase.phase).toBe('inter');

    if (roundNo === 1) {
      // A non-host cannot skip the intermission.
      guest.send({ type: 'skipIntermission' });
      expect((await guest.nextOfType('error')).code).toBe('not_host');
    }
    host.send({ type: 'skipIntermission' });
  }

  const over = await host.nextOfType('gameOver');
  expect(over.standings).toEqual([
    { playerName: 'Alice', totalPoints: 3, rank: 1 },
    { playerName: 'Bob', totalPoints: 0, rank: 2 },
  ]);
  expect(over.rounds).toHaveLength(3);
  expect(over.rounds.map((r) => r.roundNo)).toEqual([1, 2, 3]);
  // The title is decoupled from the end-screen history (it rides only the live reveal), so the gameOver
  // round results must stay title-free even though they share the reveal payload's other fields.
  expect(over.rounds.every((round) => !('title' in round))).toBe(true);

  host.close();
  guest.close();
});

test('a host can report a clip failure to swap the video without consuming the round number', async ({ request }) => {
  const { host, guest } = await readyRoom(request, '122', '123');

  host.send({ type: 'start', settings: GAME_SETTINGS });
  const first = await host.nextOfType('round');
  expect(first.roundNo).toBe(1);

  host.send({ type: 'reportClipFailure', roundId: first.roundId });
  const replacement = await host.nextOfType('round');
  // Same round number, a freshly drawn (necessarily different) clip.
  expect(replacement.roundNo).toBe(1);
  expect(replacement.youtubeId).not.toBe(first.youtubeId);

  // A duplicate report naming the already-skipped round is ignored: no second replacement is drawn.
  host.send({ type: 'reportClipFailure', roundId: first.roundId });
  expect((await host.nextOfType('error')).code).toBe('invalid_round');

  host.close();
  guest.close();
});

test('start is rejected for a non-host and for an already-active room', async ({ request }) => {
  const { host, guest } = await readyRoom(request, '124', '125');

  // A non-host cannot start the game.
  guest.send({ type: 'start', settings: GAME_SETTINGS });
  expect((await guest.nextOfType('error')).code).toBe('not_host');

  host.send({ type: 'start', settings: GAME_SETTINGS });
  await host.nextOfType('round');

  // A second start while a game is already running is rejected (no duplicate game / scheduler).
  host.send({ type: 'start', settings: GAME_SETTINGS });
  expect((await host.nextOfType('error')).code).toBe('already_active');

  host.close();
  guest.close();
});

test('a mid-game reconnect resyncs the player with the active game snapshot and resumes the round', async ({ request }) => {
  test.setTimeout(120_000);
  const { host, guest, hostToken } = await readyRoom(request, '126', '127');

  host.send({ type: 'start', settings: GAME_SETTINGS });
  const round = await host.nextOfType('round');
  const guessPhase = await host.nextOfType('phase');
  expect(guessPhase.phase).toBe('guess');
  const trueCount = VIEW_COUNTS[round.youtubeId];
  host.send({ type: 'guess', value: trueCount });

  // Empty the room (both sockets) so the scheduler pauses, then reconnect the host within the guess window.
  host.close();
  guest.close();
  await host.closed;
  await guest.closed;

  const back = await openWs();
  back.send({ type: 'join', sessionToken: hostToken });
  const snapshot = await back.nextOfType('snapshot');
  expect(snapshot.game).not.toBeNull();
  expect(snapshot.game?.phase).toBe('guess');
  expect(snapshot.game?.round?.roundId).toBe(round.roundId);
  expect(snapshot.game?.yourGuess).toBe(trueCount);
  // Null reveal pre-reveal also withholds the title (it rides only the reveal payload), so a reconnecting
  // player cannot read the answer during the guess window.
  expect(snapshot.game?.reveal).toBeNull();

  // The paused round resumes for the reconnected player: the guess window still closes into a reveal.
  const reveal = await back.nextOfType('reveal');
  expect(reveal.viewCount).toBe(trueCount);
  expect(reveal.results.find((r) => r.isWinner)?.playerName).toBe('Alice');

  back.close();
});

test('a reconnect during reveal_sting withholds the just-scored round from the snapshot standings', async ({ request }) => {
  test.setTimeout(120_000);
  const { host, guest, hostToken } = await readyRoom(request, '130', '131');

  host.send({ type: 'start', settings: GAME_SETTINGS });
  const round = await host.nextOfType('round');
  const guessPhase = await host.nextOfType('phase');
  expect(guessPhase.phase).toBe('guess');
  host.send({ type: 'guess', value: VIEW_COUNTS[round.youtubeId] });

  // The round is scored when the guess window closes into reveal_sting; pause the room in that suspense
  // window, before the public reveal, then reconnect.
  const sting = await host.nextOfType('phase');
  expect(sting.phase).toBe('reveal_sting');
  host.close();
  guest.close();
  await host.closed;
  await guest.closed;

  const back = await openWs();
  back.send({ type: 'join', sessionToken: hostToken });
  const snapshot = await back.nextOfType('snapshot');
  expect(snapshot.game?.phase).toBe('reveal_sting');
  expect(snapshot.game?.reveal).toBeNull();
  // The just-scored round must not leak into the standings ahead of the reveal sequence.
  expect(snapshot.game?.standings.every((s) => s.totalPoints === 0)).toBe(true);

  back.close();
});

test('a rematch from a finished room starts a fresh game whose leaderboard excludes the prior game', async ({ request }) => {
  test.setTimeout(300_000);
  const { host, guest } = await readyRoom(request, '128', '129');

  host.send({ type: 'start', settings: GAME_SETTINGS });
  const firstOver = await playToGameOver(host, guest, 3);
  expect(firstOver.standings.find((s) => s.playerName === 'Alice')?.totalPoints).toBe(3);

  // Rematch: same room + roster, a new game whose leaderboard must not carry the prior game's points.
  host.send({ type: 'start', settings: GAME_SETTINGS });
  const round = await host.nextOfType('round');
  expect(round.roundNo).toBe(1);
  await host.nextOfType('phase');
  host.send({ type: 'guess', value: VIEW_COUNTS[round.youtubeId], final: true });
  guest.send({ type: 'guess', value: 0, final: true });
  await host.nextOfType('reveal');
  const leaderboard = await host.nextOfType('leaderboard');
  // Only the single rematch round counts: Alice has 1, not 4.
  expect(leaderboard.standings.find((s) => s.playerName === 'Alice')?.totalPoints).toBe(1);

  host.close();
  guest.close();
});

test('the guess window ends early once every connected player commits a final guess', async ({ request }) => {
  test.setTimeout(120_000);
  // A long guess timer so a timer-driven advance would be far slower than the commit-driven early advance.
  const { host, guest } = await readyRoom(request, '132', '133');
  host.send({ type: 'start', settings: { source: 'random', roundsTotal: 3, guessTimerSec: 60 } });
  const round = await host.nextOfType('round');
  const guessPhase = await host.nextOfType('phase');
  expect(guessPhase.phase).toBe('guess');
  const guessDeadline = new Date(guessPhase.phaseEndAt).getTime();

  // A draft guess does not ready a player; only a final one does.
  host.send({ type: 'guess', value: VIEW_COUNTS[round.youtubeId], final: true });
  guest.send({ type: 'guess', value: 0, final: true });

  // Both committed, so the reveal arrives well before the 60s guess timer would have fired.
  const reveal = await host.nextOfType('reveal');
  expect(reveal.viewCount).toBe(VIEW_COUNTS[round.youtubeId]);
  expect(Date.now()).toBeLessThan(guessDeadline - 30_000);

  host.close();
  guest.close();
});

test('a draft guess does not ready a player, so the guess window runs to its timer', async ({ request }) => {
  test.setTimeout(60_000);
  const { host, guest } = await readyRoom(request, '134', '135');
  host.send({ type: 'start', settings: { source: 'random', roundsTotal: 3, guessTimerSec: 15 } });
  const round = await host.nextOfType('round');
  const guessPhase = await host.nextOfType('phase');
  expect(guessPhase.phase).toBe('guess');
  const start = Date.now();

  // The host commits, but the guest only drafts (no final). Not every connected player is ready, so the
  // early advance must NOT fire — the window runs to its 15s timer rather than ending immediately.
  host.send({ type: 'guess', value: VIEW_COUNTS[round.youtubeId], final: true });
  guest.send({ type: 'guess', value: 0 });

  await host.nextOfType('reveal');
  expect(Date.now() - start).toBeGreaterThan(12_000);

  host.close();
  guest.close();
});
