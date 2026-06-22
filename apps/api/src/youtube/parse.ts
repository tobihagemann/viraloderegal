// Pure parsing helpers for the YouTube Data API videos.list response. Kept network- and DB-free so they
// unit-test directly.

export interface VideoMetadata {
  title: string;
  channel: string;
  durationSec: number;
}

// The subset of a videos.list item this app reads, across the part=snippet,contentDetails,statistics calls.
export interface YouTubeVideoItem {
  snippet?: { title?: string; channelTitle?: string };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

// Parse an ISO-8601 duration (e.g. "PT4M13S", "PT1H2M", "P1DT2H") into whole seconds. YouTube durations use
// the time components plus a day field for very long videos; returns null on an unparseable value.
export function parseIso8601Duration(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) {
    return null;
  }
  const [, days, hours, minutes, seconds] = match;
  return Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

// Map a videos.list item (part=snippet,contentDetails) to the metadata shape; null when a required field
// (title, channel, parseable duration) is missing.
export function mapVideosListItem(item: YouTubeVideoItem): VideoMetadata | null {
  const title = item.snippet?.title;
  const channel = item.snippet?.channelTitle;
  const duration = item.contentDetails?.duration;
  if (!title || !channel || !duration) {
    return null;
  }
  const durationSec = parseIso8601Duration(duration);
  if (durationSec === null) {
    return null;
  }
  return { title, channel, durationSec };
}

interface ApiErrorBody {
  error?: { errors?: { reason?: string }[] };
}

const QUOTA_REASONS = new Set(['quotaExceeded', 'dailyLimitExceeded']);

// Whether a 403 body's error reason indicates quota exhaustion (vs. another 403 such as a disabled key).
export function isQuotaExceededError(body: unknown): boolean {
  const errors = (body as ApiErrorBody | null | undefined)?.error?.errors ?? [];
  return errors.some((entry) => entry.reason !== undefined && QUOTA_REASONS.has(entry.reason));
}
