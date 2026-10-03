import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { preparePath } from '../../storage/local';
import { getMediaDuration } from '../../audio/probe';
import { getMockWatermarkPath } from './watermark';
import { VideoGenError, type VideoGenInput, type VideoGenProvider, type VideoGenResult } from './types';

const execFileAsync = promisify(execFile);
const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;

/** Development/testing stand-in for a real image-to-video AI provider.
 *
 *  This does NOT call any AI model. It applies a simple, deterministic
 *  ffmpeg Ken-Burns pan/zoom to the still photo and burns a clearly-visible
 *  "TEST RENDER — NOT AI-GENERATED" watermark into every frame, so its
 *  output can never be mistaken for real generated video anywhere it ends
 *  up (UI, downloaded file, screenshots).
 *
 *  Its only job is to let the rest of the pipeline (timeline, audio sync,
 *  ffmpeg assembly, export) be fully exercised without spending Replicate
 *  credit. Swap `VIDEO_PROVIDER=replicate` back on and nothing else in the
 *  app needs to change — see lib/providers/video/index.ts. */
export class MockVideoProvider implements VideoGenProvider {
  name = 'mock';

  async generateClip(input: VideoGenInput): Promise<VideoGenResult> {
    const duration = Math.max(2, Math.min(6, Math.round(input.targetSeconds)));
    const frames = duration * FPS;
    const watermark = await getMockWatermarkPath();
    const { absolutePath, publicUrl } = await preparePath('generated', 'mp4');

    // Deterministic-but-varied zoom rate so different shots don't look identical.
    const seed = hashString(input.imagePath) % 5;
    const zoomIncrement = 0.0009 + seed * 0.00025;
    const maxZoom = 1.18 + seed * 0.03;

    const args = [
      '-y',
      '-loop', '1',
      '-i', input.imagePath,
      '-i', watermark,
      '-filter_complex',
      `[0:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,crop=${WIDTH}:${HEIGHT},` +
        `scale=${WIDTH * 4}:${HEIGHT * 4},` +
        `zoompan=z='min(zoom+${zoomIncrement},${maxZoom})':d=${frames}:s=${WIDTH}x${HEIGHT}:fps=${FPS}[base];` +
        `[base][1:v]overlay=0:0:format=auto[outv]`,
      '-map', '[outv]',
      '-t', String(duration),
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-r', String(FPS),
      absolutePath,
    ];

    try {
      await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64 });
    } catch (err: any) {
      throw new VideoGenError(`Mock provider ffmpeg render failed: ${err.stderr?.slice(-2000) || err.message}`);
    }

    const durationSeconds = await getMediaDuration(absolutePath);
    void publicUrl;
    return { videoPath: absolutePath, durationSeconds, providerJobId: `mock-${randomUUID()}` };
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
