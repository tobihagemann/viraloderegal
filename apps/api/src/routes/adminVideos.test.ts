import { describe, expect, it } from 'vitest';
import { clampInt, youtubeErrorCode } from './adminVideos.js';
import { YouTubeConfigError, YouTubeNotFoundError, YouTubeQuotaError } from '../youtube/client.js';

describe('clampInt', () => {
  it('falls back on missing or non-numeric input', () => {
    expect(clampInt(undefined, 20, 1, 100)).toBe(20);
    expect(clampInt('abc', 20, 1, 100)).toBe(20);
  });

  it('truncates fractional values and clamps into range', () => {
    expect(clampInt('3.9', 20, 1, 100)).toBe(3);
    expect(clampInt('0', 20, 1, 100)).toBe(1);
    expect(clampInt('-5', 20, 1, 100)).toBe(1);
    expect(clampInt('99999', 20, 1, 100)).toBe(100);
  });
});

describe('youtubeErrorCode', () => {
  it('maps each YouTube error class to its code and returns null otherwise', () => {
    expect(youtubeErrorCode(new YouTubeConfigError())).toBe('config_missing');
    expect(youtubeErrorCode(new YouTubeQuotaError())).toBe('quota_exhausted');
    expect(youtubeErrorCode(new YouTubeNotFoundError('x'))).toBe('video_not_found');
    expect(youtubeErrorCode(new Error('boom'))).toBeNull();
  });
});
