import { onMounted, onUnmounted, ref, type Ref, watch } from 'vue';
import { useMute } from './useMute.js';

// Minimal surface of the YouTube IFrame Player API we use; the API ships no types and the project avoids
// `any`, so the handful of members touched here are declared explicitly.
interface YTPlayer {
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setVolume(volume: number): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  unloadModule(module: string): void;
  destroy(): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTPlayerOptions {
  // Serve the embed from youtube-nocookie.com (privacy-enhanced mode): YouTube then sets no tracking cookies
  // until the viewer actually plays a clip, which is what our Datenschutz relies on.
  host: string;
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady?: (event: YTPlayerEvent) => void;
    onStateChange?: (event: YTPlayerEvent) => void;
    onError?: (event: YTPlayerEvent) => void;
  };
}

// YT.PlayerState.PLAYING — used to prime the audio during the pre-roll and to drop the overlay once the
// handed-over clip is genuinely playing.
const YT_PLAYING = 1;

interface YTNamespace {
  Player: new (element: HTMLElement, options: YTPlayerOptions) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

// Embed/content error codes that mean this specific clip cannot play: invalid id, HTML5 playback failure,
// removed/private, and embedding disabled. Transient network failures use other codes and are not in this
// set, so a YouTube outage does not cascade-skip every round.
const CLIP_ERROR_CODES = [2, 5, 100, 101, 150];

// Force captions off. With the gentle clip overscan the caption strip isn't cropped, and cc_load_policy can only
// force captions on — so the module has to be unloaded. The module id differs across the HTML5 and legacy
// players, and unloading one that never loaded can throw, so try both defensively.
function disableCaptions(target: YTPlayer): void {
  for (const module of ['captions', 'cc']) {
    try {
      target.unloadModule(module);
    } catch {
      // ignore: the module may not be loaded
    }
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }
  if (apiPromise) {
    return apiPromise;
  }
  apiPromise = new Promise<YTNamespace>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) {
        resolve(window.YT);
      }
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiPromise;
}

export interface YouTubeOptions {
  container: Ref<HTMLElement | null>;
  videoId: string;
  startSec: number;
  endSec: number;
  // Enables the get-ready pre-buffer behind an opaque overlay. Instead of playing on ready, the player
  // autoplays muted (hidden) to warm the clip segment's buffer and the audio track; at reveal it seeks back to
  // the exact clip start and plays, so every client sees the identical segment. That seek costs a ~250ms
  // decoder re-prime even with the clip fully buffered — the caller keeps the overlay up until `playing`
  // latches so the re-prime stays hidden. Defaults to off (play immediately on ready), for the admin preview.
  prebuffer?: boolean;
  // Called once when the player reports a genuine embed/availability error (host-only at the call site).
  onClipError?: () => void;
}

export function useYouTube(options: YouTubeOptions): { play: () => void; playing: Ref<boolean> } {
  const muted = useMute();
  const prebuffer = options.prebuffer ?? false;
  let player: YTPlayer | null = null;
  let destroyed = false;
  let ready = false;
  // False only while the prebuffer pre-roll plays hidden; the clip is "handed over" (cued) at play().
  let cued = !prebuffer;
  // Latches true once the handed-over clip is playing, so the caller can hold its get-ready overlay until the
  // seek re-prime is over. Latched (never reset) so a later pause/end cannot flicker it; a remount resets it.
  const playing = ref(false);

  // Honor the user's sound preference. Switch sound on by raising the volume, not by unMute(), when the player
  // is already unmuted: a muted player buffers no audio, so unMute() mid-clip re-fetches the audio track and
  // hitches the playhead. The pre-roll primes the audio (unMute at volume 0) so reveal only changes the volume.
  function applyAudio(target: YTPlayer): void {
    if (muted.value) {
      target.mute();
      return;
    }
    if (target.isMuted()) {
      target.unMute();
    }
    target.setVolume(100);
  }

  // Hand the clip to the viewer. In prebuffer mode, seek to the exact clip start so every client sees the same
  // segment; the muted pre-roll already buffered it, so this is a brief decoder re-prime the overlay hides.
  // Immediate mode has no pre-roll, so this is the plain play path.
  function play(): void {
    cued = true;
    if (!ready || !player) {
      return;
    }
    if (prebuffer) {
      player.seekTo(options.startSec, true);
    }
    applyAudio(player);
    player.playVideo();
  }

  onMounted(async () => {
    if (!options.videoId) {
      return;
    }
    const YT = await loadApi();
    if (destroyed || !options.container.value) {
      return;
    }
    // Mount into a throwaway child the API replaces with its iframe, so Vue never tries to unmount a node
    // YT already swapped out.
    const mount = document.createElement('div');
    options.container.value.appendChild(mount);
    player = new YT.Player(mount, {
      host: 'https://www.youtube-nocookie.com',
      videoId: options.videoId,
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        rel: 0,
        playsinline: 1,
        start: options.startSec,
        end: options.endSec,
        // Force mute while pre-buffering so the hidden pre-roll is silent; otherwise honor the user's toggle.
        mute: prebuffer || muted.value ? 1 : 0,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          ready = true;
          disableCaptions(event.target);
          if (prebuffer && !cued) {
            event.target.mute();
            event.target.playVideo();
            return;
          }
          applyAudio(event.target);
          event.target.playVideo();
        },
        onStateChange: (event) => {
          if (event.data !== YT_PLAYING) {
            return;
          }
          // Captions can finish loading after onReady, so re-assert them off on every play.
          disableCaptions(event.target);
          // Prime the audio track during the hidden pre-roll for sound-on players: unmute but hold volume at 0
          // so the audio buffers silently and reveal only has to raise the volume — no mid-clip unMute() hitch.
          // The unmute transition clamps the volume up to a small audible floor even when it was zeroed just
          // before, so the volume must be re-zeroed after unMute() — a setVolume(0) on an already-unmuted
          // player does stick, keeping the pre-roll silent.
          if (prebuffer && !cued && !muted.value && event.target.isMuted()) {
            event.target.setVolume(0);
            event.target.unMute();
            event.target.setVolume(0);
          }
          // The handed-over clip is playing (past the seek re-prime) — let the caller drop its get-ready overlay.
          if (cued) {
            playing.value = true;
          }
        },
        onError: (event) => {
          if (CLIP_ERROR_CODES.includes(event.data)) {
            options.onClipError?.();
          }
        },
      },
    });
  });

  watch(muted, () => {
    // Keep the hidden pre-roll silent regardless of the toggle; honor it once the clip is live. A live unmute
    // mid-clip re-fetches the audio and briefly hitches — that is the user's own action.
    if (!player || !cued) return;
    applyAudio(player);
  });

  onUnmounted(() => {
    destroyed = true;
    try {
      player?.destroy();
    } catch {
      // ignore: the iframe may already be gone
    }
    player = null;
  });

  return { play, playing };
}
