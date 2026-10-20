import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Renders the Icon Composer document to the app icons. Only Apple's renderer draws the enclosure (its squircle and rim
// light) and the glass on the bars, so this runs only on a Mac with Xcode installed. favicon.ico is the flat mark from
// favicon.svg instead, so a browser that skips the SVG favicon shows the same mark in its tab.
const BRAND = fileURLToPath(new URL('../src/assets/brand/', import.meta.url));
const SOURCE = join(BRAND, 'ViralOderEgal.icon');
const PUBLIC = fileURLToPath(new URL('../public/', import.meta.url));
const FLAT_MARK = join(PUBLIC, 'favicon.svg');

// Rendered large and resampled down: the rim light is a hairline that a render at the final size would alias.
const MASTER_SIZE = 2048;
const RENDER_SCALE = 2;
const TOUCH_ICON_SIZE = 180;
const LOGO_SIZE = 512;

// sharp draws an SVG straight at the size it is resized to, so each favicon is the vector rasterized at its own size,
// as a browser draws favicon.svg.
const FAVICON_SIZES = [16, 32, 48];

// The renderer masks every export to the squircle. Enlarged by a quarter and cropped back to size, a render carries the
// squircle's edge and rim light out of frame. What is left is the enclosure as the renderer lit it, full bleed.
const ENLARGEMENT = 1.25;

function ictool(): string {
  const developer = execFileSync('xcode-select', ['--print-path'], { encoding: 'utf8' }).trim();
  return join(developer, '../Applications/Icon Composer.app/Contents/Executables/ictool');
}

function render(): Buffer {
  const scratch = mkdtempSync(join(tmpdir(), 'viraloderegal-icon-'));
  try {
    const output = join(scratch, 'master.png');
    execFileSync(ictool(), [
      SOURCE,
      '--export-image',
      '--output-file',
      output,
      '--platform',
      'iOS',
      '--rendition',
      'Default',
      '--width',
      String(MASTER_SIZE / RENDER_SCALE),
      '--height',
      String(MASTER_SIZE / RENDER_SCALE),
      '--scale',
      String(RENDER_SCALE),
      // The Liquid Glass renderer.
      '--design-generation',
      '27',
    ]);
    return readFileSync(output);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// iOS masks a touch icon itself and paints a transparent corner black. So the master is laid over its own enlarged
// center, whose corners carry the enclosure's lit colors. A backing in the document's flat gradient would not match.
async function fullBleed(master: Buffer): Promise<Buffer> {
  const enlarged = Math.round(MASTER_SIZE * ENLARGEMENT);
  const inset = (enlarged - MASTER_SIZE) / 2;
  return sharp(master)
    .resize(enlarged, enlarged)
    .extract({ left: inset, top: inset, width: MASTER_SIZE, height: MASTER_SIZE })
    .composite([{ input: master }])
    .removeAlpha()
    .keepIccProfile()
    .png()
    .toBuffer();
}

// ictool renders in Display P3, the space the fill's colors are given in. sharp converts every output to sRGB by
// default, which would clip the red the UI's oklch palette shows on a wide-gamut screen, so the profile is kept.
function resized(image: Buffer | string, size: number) {
  return sharp(image).resize(size, size).keepIccProfile().png({ compressionLevel: 9 });
}

const ICONDIR_SIZE = 6;
const ICONDIRENTRY_SIZE = 16;

/** An ICO whose entries are PNGs, which every browser that still asks for `favicon.ico` reads. */
function ico(entries: { size: number; png: Buffer }[]): Buffer {
  // ICONDIR: reserved, type (1 = icon), count. ICONDIRENTRY: width, height, colors, reserved, planes, bpp, size, offset.
  const header = Buffer.alloc(ICONDIR_SIZE + ICONDIRENTRY_SIZE * entries.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, index) => {
    const entry = ICONDIR_SIZE + ICONDIRENTRY_SIZE * index;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map(({ png }) => png)]);
}

const master = render();
await resized(master, LOGO_SIZE).toFile(join(BRAND, 'logo.png'));
await resized(await fullBleed(master), TOUCH_ICON_SIZE).toFile(join(PUBLIC, 'apple-touch-icon.png'));

const favicons = await Promise.all(FAVICON_SIZES.map(async (size) => ({ size, png: await resized(FLAT_MARK, size).toBuffer() })));
writeFileSync(join(PUBLIC, 'favicon.ico'), ico(favicons));

console.log(`Rendered the app icons into ${BRAND} and ${PUBLIC}`);
