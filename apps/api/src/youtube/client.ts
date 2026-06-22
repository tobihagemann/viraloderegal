import { env } from '../env.js';
import { FETCH_TIMEOUT_MS, QUOTA_BACKOFF_MS } from './constants.js';
import { isQuotaExceededError, mapVideosListItem, type VideoMetadata, type YouTubeVideoItem } from './parse.js';

const VIDEOS_ENDPOINT = 'https://www.googleapis.com/youtube/v3/videos';

// Raised when YOUTUBE_API_KEY is unset; the env field stays optional so the API boots without curation, and
// any curation call surfaces this as config_missing rather than crashing.
export class YouTubeConfigError extends Error {}
// Raised while the shared quota backoff holds or on a fresh quota-exhausted 403.
export class YouTubeQuotaError extends Error {}
// Raised when the id is absent from the response or the metadata is incomplete.
export class YouTubeNotFoundError extends Error {}

// Module-scoped so one exhausted response stops every caller (metadata fetch, manual refresh, nightly job,
// loop-time resolve). The flag clears on its own once the backoff expires; a success need not clear it early.
let quotaExhaustedUntil = 0;

export function isQuotaExhausted(): boolean {
  return Date.now() < quotaExhaustedUntil;
}

export function quotaResetsAt(): string | null {
  return isQuotaExhausted() ? new Date(quotaExhaustedUntil).toISOString() : null;
}

async function requestVideoItem(youtubeId: string, part: string): Promise<YouTubeVideoItem | null> {
  if (!env.YOUTUBE_API_KEY) {
    throw new YouTubeConfigError('YOUTUBE_API_KEY is not configured');
  }
  // Short-circuit without an API call while the backoff holds so a quota-exhausted state stops burning quota.
  if (isQuotaExhausted()) {
    throw new YouTubeQuotaError('YouTube quota is exhausted');
  }
  const url = `${VIDEOS_ENDPOINT}?part=${part}&id=${youtubeId}&key=${env.YOUTUBE_API_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (res.status === 403) {
    const body = await res.json().catch(() => null);
    if (isQuotaExceededError(body)) {
      quotaExhaustedUntil = Date.now() + QUOTA_BACKOFF_MS;
      throw new YouTubeQuotaError('YouTube quota is exhausted');
    }
    throw new Error('YouTube API request failed: 403');
  }
  if (!res.ok) {
    throw new Error(`YouTube API request failed: ${res.status}`);
  }
  const body = (await res.json()) as { items?: YouTubeVideoItem[] };
  return body.items?.[0] ?? null;
}

export interface VideoForUpsert {
  metadata: VideoMetadata;
  viewCount: number;
}

// Everything the admin form needs in a single videos.list call. A videos.list read costs 1 quota unit
// regardless of how many parts it requests, so fetching snippet+contentDetails+statistics together is half
// the quota of separate metadata and view-count calls.
export async function fetchVideoForUpsert(youtubeId: string): Promise<VideoForUpsert> {
  const item = await requestVideoItem(youtubeId, 'snippet,contentDetails,statistics');
  const metadata = item && mapVideosListItem(item);
  const viewCount = item?.statistics?.viewCount;
  if (!metadata || viewCount === undefined) {
    throw new YouTubeNotFoundError(youtubeId);
  }
  return { metadata, viewCount: Number(viewCount) };
}

export async function fetchViewCount(youtubeId: string): Promise<number> {
  const item = await requestVideoItem(youtubeId, 'statistics');
  const viewCount = item?.statistics?.viewCount;
  if (viewCount === undefined) {
    throw new YouTubeNotFoundError(youtubeId);
  }
  return Number(viewCount);
}
