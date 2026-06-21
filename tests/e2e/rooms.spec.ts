import { expect, test } from '@playwright/test';
import { connect, createRoom, ip, openWs, waitForLobby } from './helpers.js';

// Mirror the server's rate limits; kept as literals so the spec does not import API source.
const JOIN_RATE_LIMIT = 10;
const CREATE_RATE_LIMIT = 5;

test('create returns a six-character code and a session token', async ({ request }) => {
  const room = await createRoom(request, 'Alice', ip('1'));
  expect(room.code).toMatch(/^[A-Z0-9]{6}$/);
  expect(room.sessionToken).toBeTruthy();
});

test('join rejects an unknown room code', async ({ request }) => {
  const res = await request.post('/rooms/join', { data: { code: 'ZZZZZZ', name: 'Bob' }, headers: ip('2') });
  expect(res.status()).toBe(404);
  expect((await res.json()).code).toBe('not_found');
});

test('join rejects an invalid username', async ({ request }) => {
  const room = await createRoom(request, 'Alice', ip('3'));
  const res = await request.post('/rooms/join', { data: { code: room.code, name: 'ab' }, headers: ip('3') });
  expect(res.status()).toBe(400);
  expect((await res.json()).code).toBe('too_short');
});

test('join rejects a case-insensitive duplicate name', async ({ request }) => {
  const room = await createRoom(request, 'Charlie', ip('4'));
  const res = await request.post('/rooms/join', { data: { code: room.code, name: 'charlie' }, headers: ip('4') });
  expect(res.status()).toBe(409);
  expect((await res.json()).code).toBe('name_taken');
});

test('join is rate-limited after the per-IP window allowance', async ({ request }) => {
  const headers = ip('5');
  for (let i = 0; i < JOIN_RATE_LIMIT; i++) {
    const res = await request.post('/rooms/join', { data: { code: 'ZZZZZZ', name: `Guest${i}` }, headers });
    expect(res.status()).toBe(404);
  }
  const limited = await request.post('/rooms/join', { data: { code: 'ZZZZZZ', name: 'GuestX' }, headers });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).code).toBe('rate_limited');
});

test('the lobby broadcasts the roster and opens the start gate once enough players are connected', async ({ request }) => {
  const host = await createRoom(request, 'Hanna', ip('10'));

  const hostWs = await openWs();
  hostWs.send({ type: 'join', sessionToken: host.sessionToken });
  const snapshot = await hostWs.nextOfType('snapshot');
  expect(snapshot.lobby.players).toHaveLength(1);
  expect(snapshot.you).toBe(snapshot.lobby.players[0].id);
  // A lone player cannot start.
  expect(snapshot.lobby.canStart).toBe(false);

  const guest = await request.post('/rooms/join', { data: { code: host.code, name: 'Guest' }, headers: ip('11') });
  expect(guest.status()).toBe(200);
  const guestToken = (await guest.json()).sessionToken;

  const guestWs = await openWs();
  guestWs.send({ type: 'join', sessionToken: guestToken });
  await guestWs.nextOfType('snapshot');

  // Once the second player connects the start gate opens — sound activation is not required.
  let lobby = await hostWs.nextOfType('lobby');
  while (lobby.lobby.players.length < 2 || !lobby.lobby.canStart) {
    lobby = await hostWs.nextOfType('lobby');
  }
  expect(lobby.lobby.players).toHaveLength(2);
  expect(lobby.lobby.canStart).toBe(true);

  hostWs.close();
  guestWs.close();
});

test('a reconnect with the session token restores the seat and replays a snapshot', async ({ request }) => {
  const host = await createRoom(request, 'Returner', ip('20'));
  const first = await openWs();
  first.send({ type: 'join', sessionToken: host.sessionToken });
  const initial = await first.nextOfType('snapshot');
  const playerId = initial.you;
  first.close();

  const second = await openWs();
  second.send({ type: 'join', sessionToken: host.sessionToken });
  const replay = await second.nextOfType('snapshot');
  expect(replay.you).toBe(playerId);
  expect(replay.lobby.players.find((p) => p.id === playerId)?.connected).toBe(true);
  second.close();
});

test('a banned IP cannot rejoin the room', async ({ request }) => {
  const host = await createRoom(request, 'Owner', ip('30'));
  const victim = await request.post('/rooms/join', { data: { code: host.code, name: 'Victim' }, headers: ip('31') });
  const victimToken = (await victim.json()).sessionToken;

  const hostWs = await openWs();
  hostWs.send({ type: 'join', sessionToken: host.sessionToken });
  await hostWs.nextOfType('snapshot');

  const victimWs = await openWs();
  victimWs.send({ type: 'join', sessionToken: victimToken });
  await victimWs.nextOfType('snapshot');

  const lobby = await hostWs.nextOfType('lobby');
  const victimEntry = lobby.lobby.players.find((p) => !p.isHost);
  expect(victimEntry).toBeDefined();
  hostWs.send({ type: 'ban', playerId: victimEntry?.id });
  await victimWs.nextOfType('kicked');

  const rejoin = await request.post('/rooms/join', { data: { code: host.code, name: 'Victim2' }, headers: ip('31') });
  expect(rejoin.status()).toBe(403);
  expect((await rejoin.json()).code).toBe('banned');

  hostWs.close();
});

test('a banned IP cannot reconnect a second same-IP session over ws', async ({ request }) => {
  const host = await createRoom(request, 'Warden', ip('80'));
  const twin1 = await request.post('/rooms/join', { data: { code: host.code, name: 'Twin1' }, headers: ip('81') });
  const twin2 = await request.post('/rooms/join', { data: { code: host.code, name: 'Twin2' }, headers: ip('81') });
  const twin1Token = (await twin1.json()).sessionToken;
  const twin2Token = (await twin2.json()).sessionToken;

  const hostConn = await connect(host.sessionToken);
  const twin1Conn = await connect(twin1Token);
  await waitForLobby(hostConn.ws, (lobby) => lobby.players.length >= 2);

  hostConn.ws.send({ type: 'ban', playerId: twin1Conn.playerId });
  await twin1Conn.ws.nextOfType('kicked');

  // The second session shares the banned IP and still holds a valid token, but its ws reconnect is refused.
  const twin2Ws = await openWs();
  twin2Ws.send({ type: 'join', sessionToken: twin2Token });
  expect((await twin2Ws.nextOfType('error')).code).toBe('banned');

  twin2Ws.close();
  twin1Conn.ws.close();
  hostConn.ws.close();
});

test('a kicked player cannot reconnect with its old token', async ({ request }) => {
  const host = await createRoom(request, 'Bouncer', ip('97'));
  const guest = await request.post('/rooms/join', { data: { code: host.code, name: 'Goner' }, headers: ip('98') });
  const guestToken = (await guest.json()).sessionToken;

  const hostConn = await connect(host.sessionToken);
  const guestConn = await connect(guestToken);
  await waitForLobby(hostConn.ws, (lobby) => lobby.players.length === 2);

  hostConn.ws.send({ type: 'kick', playerId: guestConn.playerId });
  await guestConn.ws.nextOfType('kicked');

  // The kicked player's row is deleted, so reusing the old token is rejected.
  const retry = await openWs();
  retry.send({ type: 'join', sessionToken: guestToken });
  expect((await retry.nextOfType('error')).code).toBe('invalid_token');

  retry.close();
  hostConn.ws.close();
});

test('ws rejects a second join on an already-bound socket', async ({ request }) => {
  const host = await createRoom(request, 'Doppel', ip('99'));
  const conn = await connect(host.sessionToken);
  conn.ws.send({ type: 'join', sessionToken: host.sessionToken });
  expect((await conn.ws.nextOfType('error')).code).toBe('already_joined');
  conn.ws.close();
});

test('ws rejects an unknown session token', async () => {
  const ws = await openWs();
  ws.send({ type: 'join', sessionToken: 'not-a-real-session-token' });
  const error = await ws.nextOfType('error');
  expect(error.code).toBe('invalid_token');
});

test('ws rejects a command sent before joining and an unknown command', async () => {
  const before = await openWs();
  before.send({ type: 'activateSound' });
  expect((await before.nextOfType('error')).code).toBe('not_joined');
  before.close();

  const unknown = await openWs();
  unknown.send({ type: 'definitely-not-a-command' });
  expect((await unknown.nextOfType('error')).code).toBe('bad_message');
  unknown.close();
});

test('a non-host cannot kick another player', async ({ request }) => {
  const host = await createRoom(request, 'Chief', ip('40'));
  const guest = await request.post('/rooms/join', { data: { code: host.code, name: 'Member' }, headers: ip('41') });
  const guestToken = (await guest.json()).sessionToken;

  const hostConn = await connect(host.sessionToken);
  const guestConn = await connect(guestToken);

  guestConn.ws.send({ type: 'kick', playerId: hostConn.playerId });
  expect((await guestConn.ws.nextOfType('error')).code).toBe('not_host');

  hostConn.ws.close();
  guestConn.ws.close();
});

test('the host can kick a player, who is told why and dropped from the roster', async ({ request }) => {
  const host = await createRoom(request, 'Boss', ip('45'));
  const guest = await request.post('/rooms/join', { data: { code: host.code, name: 'Target' }, headers: ip('46') });
  const guestToken = (await guest.json()).sessionToken;

  const hostConn = await connect(host.sessionToken);
  const guestConn = await connect(guestToken);
  await waitForLobby(hostConn.ws, (lobby) => lobby.players.length === 2);

  hostConn.ws.send({ type: 'kick', playerId: guestConn.playerId });
  expect((await guestConn.ws.nextOfType('kicked')).reason).toBe('kick');
  const after = await waitForLobby(hostConn.ws, (lobby) => lobby.players.length === 1);
  expect(after.players[0].id).toBe(hostConn.playerId);

  hostConn.ws.close();
  guestConn.ws.close();
});

test('host transfers to a connected player when the host disconnects', async ({ request }) => {
  const host = await createRoom(request, 'Captain', ip('50'));
  const guest = await request.post('/rooms/join', { data: { code: host.code, name: 'Mate' }, headers: ip('51') });
  const guestToken = (await guest.json()).sessionToken;

  const hostConn = await connect(host.sessionToken);
  const guestConn = await connect(guestToken);
  await waitForLobby(hostConn.ws, (lobby) => lobby.players.length === 2);

  hostConn.ws.close();
  const lobby = await waitForLobby(guestConn.ws, (l) => l.players.find((p) => p.id === guestConn.playerId)?.isHost === true);
  // Exactly one host row, and it is the still-connected player.
  expect(lobby.players.filter((p) => p.isHost)).toHaveLength(1);
  expect(lobby.players.find((p) => p.id === guestConn.playerId)?.isHost).toBe(true);

  guestConn.ws.close();
});

test('create is rate-limited after the per-IP window allowance', async ({ request }) => {
  const headers = ip('90');
  for (let i = 0; i < CREATE_RATE_LIMIT; i++) {
    const res = await request.post('/rooms', { data: { name: `Maker${i}` }, headers });
    expect(res.status()).toBe(201);
  }
  const limited = await request.post('/rooms', { data: { name: 'MakerX' }, headers });
  expect(limited.status()).toBe(429);
  expect((await limited.json()).code).toBe('rate_limited');
});

test('the host cannot kick itself', async ({ request }) => {
  const host = await createRoom(request, 'Solo', ip('91'));
  const hostConn = await connect(host.sessionToken);
  hostConn.ws.send({ type: 'kick', playerId: hostConn.playerId });
  expect((await hostConn.ws.nextOfType('error')).code).toBe('not_found');
  hostConn.ws.close();
});

test('a reconnect supersedes a still-open socket without dropping the player', async ({ request }) => {
  const host = await createRoom(request, 'Persist', ip('92'));
  const first = await connect(host.sessionToken);

  // Open a second socket with the same token while the first is still live; it supersedes the first.
  const second = await openWs();
  second.send({ type: 'join', sessionToken: host.sessionToken });
  expect((await second.nextOfType('snapshot')).you).toBe(first.playerId);

  // Wait for the server to actually close the superseded first socket, then trigger a broadcast; the first
  // socket's stale close must not drop the player (this ordering deterministically exercises the guard).
  await first.ws.closed;
  second.send({ type: 'activateSound' });
  const lobby = await waitForLobby(second, (l) => l.players.some((p) => p.id === first.playerId && p.soundActivated));
  expect(lobby.players.find((p) => p.id === first.playerId)?.connected).toBe(true);
  second.close();
});

test('a fully-disconnected room resumes when a player reconnects', async ({ request }) => {
  const host = await createRoom(request, 'Skipper', ip('93'));
  const guest = await request.post('/rooms/join', { data: { code: host.code, name: 'Crew' }, headers: ip('94') });
  const guestToken = (await guest.json()).sessionToken;

  const hostConn = await connect(host.sessionToken);
  const guestConn = await connect(guestToken);
  await waitForLobby(hostConn.ws, (lobby) => lobby.players.length === 2);

  hostConn.ws.close();
  guestConn.ws.close();

  // Reconnect after the room emptied: the seat is restored and the room is live again with exactly one
  // connected host (assigned via resume or the late host-disconnect transfer — both converge here).
  const back = await openWs();
  back.send({ type: 'join', sessionToken: guestToken });
  const snapshot = await back.nextOfType('snapshot');
  expect(snapshot.you).toBe(guestConn.playerId);
  expect(snapshot.lobby.players.find((p) => p.id === guestConn.playerId)?.connected).toBe(true);
  const lobby = await waitForLobby(back, (l) => l.players.filter((p) => p.isHost).length === 1 && (l.players.find((p) => p.isHost)?.connected ?? false));
  expect(lobby.players.find((p) => p.isHost)?.id).toBe(guestConn.playerId);
  back.close();
});

test('the original host can take the role back after a transfer', async ({ request }) => {
  const host = await createRoom(request, 'Owner2', ip('95'));
  const guest = await request.post('/rooms/join', { data: { code: host.code, name: 'Deputy' }, headers: ip('96') });
  const guestToken = (await guest.json()).sessionToken;

  const hostConn = await connect(host.sessionToken);
  const guestConn = await connect(guestToken);
  await waitForLobby(hostConn.ws, (lobby) => lobby.players.length === 2);

  // Host drops -> guest becomes host.
  hostConn.ws.close();
  await waitForLobby(guestConn.ws, (l) => l.players.find((p) => p.id === guestConn.playerId)?.isHost === true);

  // Original host reconnects; the current host (guest) hands the role back to it.
  const hostBack = await connect(host.sessionToken);
  guestConn.ws.send({ type: 'handBackHost' });
  const lobby = await waitForLobby(hostBack.ws, (l) => l.players.find((p) => p.id === hostConn.playerId)?.isHost === true);
  expect(lobby.players.filter((p) => p.isHost)).toHaveLength(1);
  expect(lobby.players.find((p) => p.isHost)?.id).toBe(hostConn.playerId);

  hostBack.ws.close();
  guestConn.ws.close();
});

test('joining a full room is rejected', async ({ request }) => {
  const host = await createRoom(request, 'Filler', ip('60'));
  // Host occupies seat 1; fill the remaining nine seats (MAX_PLAYERS = 10), each from a distinct IP.
  for (let i = 1; i <= 9; i++) {
    const res = await request.post('/rooms/join', { data: { code: host.code, name: `Seat${i}` }, headers: ip(`6${i}`) });
    expect(res.status()).toBe(200);
  }
  const overflow = await request.post('/rooms/join', { data: { code: host.code, name: 'Overflow' }, headers: ip('70') });
  expect(overflow.status()).toBe(409);
  expect((await overflow.json()).code).toBe('room_full');
});
