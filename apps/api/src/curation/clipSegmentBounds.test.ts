import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { videoUpsertSchema } from '@viraloderegal/shared';
import { describe, expect, it } from 'vitest';

// The videos_clip_segment_check → clip_out_of_range mapping in adminVideos.ts is intentional defense-in-depth,
// unreachable through the route only because the shared Zod schema enforces the same 3–15 bounds the CHECK
// does. This guard fails CI if those two ever diverge (the sole thing that would make the branch reachable),
// exercising the real Zod chain at its boundaries rather than comparing a bare constant.

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../../migrations');

// The up block only: the widen migration's own `down` and init_schema's `up` both carry `between 3 and 12`, so
// a whole-file match would grab the wrong bounds. Slice from `export const up` to the next `export`.
function extractUpBlock(source: string): string {
  const upStart = source.search(/export const up\b/);
  if (upStart === -1) {
    return '';
  }
  const rest = source.slice(upStart + 'export const up'.length);
  const nextExport = rest.search(/export const \w+\b/);
  return nextExport === -1 ? rest : rest.slice(0, nextExport);
}

function clipBoundsFromUp(upBlock: string): { min: number; max: number } | null {
  if (!upBlock.includes('videos_clip_segment_check')) {
    return null;
  }
  const match = /between\s+(\d+)\s+and\s+(\d+)/.exec(upBlock);
  return match ? { min: Number(match[1]), max: Number(match[2]) } : null;
}

// The most recent migration whose up block (re)defines the constraint — a future bounds change arrives as a
// new migration, so target the latest by timestamp-sorted filename, not a fixed file.
function currentClipBounds(): { min: number; max: number } | null {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.ts'))
    .sort()
    .reverse();
  for (const file of files) {
    const bounds = clipBoundsFromUp(extractUpBlock(readFileSync(join(migrationsDir, file), 'utf8')));
    if (bounds) {
      return bounds;
    }
  }
  return null;
}

function upsertOfLength(length: number) {
  return { youtubeId: 'dQw4w9WgXcQ', clipStartSec: 0, clipEndSec: length, enabled: true, randomEligible: false, notes: null };
}

describe('clip-segment bound drift guard', () => {
  it('the shared schema accepts and rejects exactly at the migration CHECK bounds', () => {
    const bounds = currentClipBounds();
    expect(bounds).not.toBeNull();
    const { min, max } = bounds!;
    expect(videoUpsertSchema.safeParse(upsertOfLength(min)).success).toBe(true);
    expect(videoUpsertSchema.safeParse(upsertOfLength(max)).success).toBe(true);
    expect(videoUpsertSchema.safeParse(upsertOfLength(min - 1)).success).toBe(false);
    expect(videoUpsertSchema.safeParse(upsertOfLength(max + 1)).success).toBe(false);
  });
});
