import { onMounted, onUnmounted, type Ref, watch } from 'vue';
import { useMute } from './useMute.js';

// Minimal surface of the YouTube IFrame Player API we use; the API ships no types and the project avoids
// `any`, so the handful of members touched here are declared explicitly.
interface YTPlayer {
  mute(): void;
  unMute(): void;
  playVideo(): void;
  destroy(): void;
}

interface YTPlayerEvent {
  target: YTPlayer;
  data: number;
}

interface YTPlayerOptions {
  videoId: string;
  width: string;
  height: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady?: (event: YTPlayerEvent) => void;
    onError?: (event: YTPlayerEvent) => void;
  };
}

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
  // Called once when the player reports a genuine embed/availability error (host-only at the call site).
  onClipError?: () => void;
}

export function useYouTube(options: YouTubeOptions): void {
  const muted = useMute();
  let player: YTPlayer | null = null;
  let destroyed = false;

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
        mute: muted.value ? 1 : 0,
        origin: window.location.origin,
      },
      events: {
        onReady: (event) => {
          if (muted.value) {
            event.target.mute();
          } else {
            event.target.unMute();
          }
          // Start playback explicitly: a muted autoplay is always allowed, so this guarantees the segment
          // plays even if the autoplay playerVar was not honored on creation.
          event.target.playVideo();
        },
        onError: (event) => {
          if (CLIP_ERROR_CODES.includes(event.data)) {
            options.onClipError?.();
          }
        },
      },
    });
  });

  watch(muted, (value) => {
    if (!player) return;
    if (value) {
      player.mute();
    } else {
      player.unMute();
    }
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
}
