import { mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { existsSync } from 'fs';
import { STORAGE_ROOT } from '../../storage/local';

const WIDTH = 1080;
const HEIGHT = 1920;

function watermarkPath(): string {
  return path.join(STORAGE_ROOT, 'generated', '_mock-watermark.png');
}

/** Renders (once, then caches on disk) a transparent PNG overlay that clearly
 *  marks mock-provider clips as test fixtures, never to be confused with real
 *  AI-generated output. */
export async function getMockWatermarkPath(): Promise<string> {
  const out = watermarkPath();
  if (existsSync(out)) return out;
  await mkdir(path.dirname(out), { recursive: true });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <rect x="0" y="${HEIGHT - 200}" width="${WIDTH}" height="200" fill="black" fill-opacity="0.62"/>
    <text x="${WIDTH / 2}" y="${HEIGHT - 120}" font-family="Arial, Helvetica, sans-serif" font-size="46" font-weight="bold" fill="white" text-anchor="middle">TEST RENDER</text>
    <text x="${WIDTH / 2}" y="${HEIGHT - 65}" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#ff5577" text-anchor="middle">NOT AI-GENERATED &#183; placeholder motion, no Replicate call</text>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(out);
  return out;
}
