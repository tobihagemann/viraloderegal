import { computed, reactive } from 'vue';
import type { GameSnapshot, LobbyState, Player, RoundPhase, RoundResult, ServerEvent, Standing, WireErrorCode } from '@viraloderegal/shared';

// Reuse the snapshot's own field types so the live-event store and the reconnect snapshot cannot drift.
type RoundInfo = NonNullable<GameSnapshot['round']>;
type RevealData = NonNullable<GameSnapshot['reveal']>;

export type ViewMode = 'lobby' | 'game' | 'end';

interface GameStore {
  you: string | null;
  lobby: LobbyState | null;
  // Null in the lobby; a live phase otherwise. The reveal/leaderboard events carry no phase field, so the
  // reducer hard-codes their mapping (reveal → reveal_guesses, leaderboard → reveal_board).
  phase: RoundPhase | null;
  phaseEndAt: string | null;
  round: RoundInfo | null;
  reveal: RevealData | null;
  standings: Standing[];
  // The client's own committed guess, set locally on submit and seeded from the snapshot on reconnect — the
  // server sends no per-guess echo.
  yourGuess: number | null;
  roundsHistory: RoundResult[];
  finished: boolean;
  roomWarning: number | null;
  // Only ever populated from a ws error event, whose code the narrowed errorEventSchema types as WireErrorCode.
  lastError: { code: WireErrorCode; message: string } | null;
  kicked: 'kick' | 'ban' | null;
  // A terminal token rejection (the join was refused for good): the session is over and reconnecting is
  // pointless, so the view should leave the room rather than wait on a dead socket.
  terminated: 'invalid_token' | 'banned' | null;
}

function freshStore(): GameStore {
  return {
    you: null,
    lobby: null,
    phase: null,
    phaseEndAt: null,
    round: null,
    reveal: null,
    standings: [],
    yourGuess: null,
    roundsHistory: [],
    finished: false,
    roomWarning: null,
    lastError: null,
    kicked: null,
    terminated: null,
  };
}

const store = reactive<GameStore>(freshStore());

function reset(): void {
  Object.assign(store, freshStore());
}

// Funnel the reconnect snapshot's game into the same fields the live events fill, so both converge on one
// store shape. A null game means the lobby; a game with a null phase is a finished room (end screen).
function applyGameSnapshot(game: GameSnapshot | null): void {
  if (!game) {
    store.phase = null;
    store.phaseEndAt = null;
    store.round = null;
    store.reveal = null;
    store.standings = [];
    store.yourGuess = null;
    store.roundsHistory = [];
    store.finished = false;
    return;
  }
  store.standings = game.standings;
  store.roundsHistory = game.rounds;
  if (game.phase === null) {
    store.finished = true;
    store.phase = null;
    store.phaseEndAt = null;
    store.round = null;
    store.reveal = null;
    store.yourGuess = null;
    return;
  }
  store.finished = false;
  store.phase = game.phase;
  store.phaseEndAt = game.phaseEndAt;
  store.round = game.round;
  store.reveal = game.reveal;
  store.yourGuess = game.yourGuess;
}

function applyEvent(event: ServerEvent): void {
  switch (event.type) {
    case 'snapshot':
      store.you = event.you;
      store.lobby = event.lobby;
      applyGameSnapshot(event.game ?? null);
      return;
    case 'lobby':
      store.lobby = event.lobby;
      return;
    case 'round':
      store.finished = false;
      store.phase = 'clip';
      store.phaseEndAt = event.phaseEndAt;
      store.round = {
        roundId: event.roundId,
        roundNo: event.roundNo,
        roundsTotal: event.roundsTotal,
        youtubeId: event.youtubeId,
        clipStartSec: event.clipStartSec,
        clipEndSec: event.clipEndSec,
      };
      store.reveal = null;
      store.yourGuess = null;
      return;
    case 'phase':
      store.phase = event.phase;
      store.phaseEndAt = event.phaseEndAt;
      return;
    case 'reveal':
      store.phase = 'reveal_guesses';
      store.phaseEndAt = event.phaseEndAt;
      store.reveal = { viewCount: event.viewCount, title: event.title, results: event.results };
      return;
    case 'leaderboard':
      store.phase = 'reveal_board';
      store.phaseEndAt = event.phaseEndAt;
      store.standings = event.standings;
      return;
    case 'gameOver':
      store.finished = true;
      store.phase = null;
      store.phaseEndAt = null;
      store.round = null;
      store.reveal = null;
      store.standings = event.standings;
      store.roundsHistory = event.rounds;
      return;
    case 'roomWarning':
      store.roomWarning = event.secondsRemaining;
      return;
    case 'error':
      // A terminal token rejection ends the session; everything else is a transient toast.
      if (event.code === 'invalid_token' || event.code === 'banned') {
        store.terminated = event.code;
      } else {
        store.lastError = { code: event.code, message: event.message };
      }
      return;
    case 'kicked':
      store.kicked = event.reason;
      return;
  }
}

function setYourGuess(value: number): void {
  store.yourGuess = value;
}

function clearError(): void {
  store.lastError = null;
}

function dismissWarning(): void {
  store.roomWarning = null;
}

const me = computed<Player | null>(() => store.lobby?.players.find((p) => p.id === store.you) ?? null);
const isHost = computed(() => me.value?.isHost ?? false);
// A live phase or a finished game takes precedence over the lobby snapshot's status, which stays 'lobby' on
// existing clients after the host starts (the server broadcasts only the round event).
const viewMode = computed<ViewMode>(() => (store.finished ? 'end' : store.phase ? 'game' : 'lobby'));

export function useGameState() {
  return { store, me, isHost, viewMode, applyEvent, reset, setYourGuess, clearError, dismissWarning };
}
