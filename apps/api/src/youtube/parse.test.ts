import { describe, expect, it } from 'vitest';
import { isQuotaExceededError, mapVideosListItem, parseIso8601Duration } from './parse.js';

describe('parseIso8601Duration', () => {
  it('parses minutes and seconds', () => {
    expect(parseIso8601Duration('PT4M13S')).toBe(253);
  });

  it('parses hours, minutes, and a day', () => {
    expect(parseIso8601Duration('PT1H2M')).toBe(3720);
    expect(parseIso8601Duration('P1DT2H')).toBe(93600);
  });

  it('parses a bare seconds value', () => {
    expect(parseIso8601Duration('PT45S')).toBe(45);
  });

  it('returns null for an unparseable value', () => {
    expect(parseIso8601Duration('4 minutes')).toBeNull();
    expect(parseIso8601Duration('')).toBeNull();
  });
});

describe('mapVideosListItem', () => {
  it('maps a full item', () => {
    expect(mapVideosListItem({ snippet: { title: 'Despacito', channelTitle: 'Luis Fonsi' }, contentDetails: { duration: 'PT4M42S' } })).toEqual({
      title: 'Despacito',
      channel: 'Luis Fonsi',
      durationSec: 282,
    });
  });

  it('returns null when a required field or the duration is missing', () => {
    expect(mapVideosListItem({ snippet: { title: 'No channel' }, contentDetails: { duration: 'PT1M' } })).toBeNull();
    expect(mapVideosListItem({ snippet: { title: 'T', channelTitle: 'C' } })).toBeNull();
    expect(mapVideosListItem({ snippet: { title: 'T', channelTitle: 'C' }, contentDetails: { duration: 'nope' } })).toBeNull();
  });
});

describe('isQuotaExceededError', () => {
  it('detects a quota reason', () => {
    expect(isQuotaExceededError({ error: { errors: [{ reason: 'quotaExceeded' }] } })).toBe(true);
    expect(isQuotaExceededError({ error: { errors: [{ reason: 'dailyLimitExceeded' }] } })).toBe(true);
  });

  it('is false for a non-quota 403 or a malformed body', () => {
    expect(isQuotaExceededError({ error: { errors: [{ reason: 'keyInvalid' }] } })).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError({})).toBe(false);
  });
});
