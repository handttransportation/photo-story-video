import { execFile } from 'child_process';
import { promisify } from 'util';
import { getAudioDuration } from '../audio/probe';

const execFileAsync = promisify(execFile);

export interface AssembleClip {
  path: string;
  /** Seconds to actually use from this clip (already clamped to its real duration). */
  seconds: number;
}

export interface AssembleInput {
  clips: AssembleClip[];
  audioPath: string;
  outPath: string;
}

export interface AssembleResult {
  outPath: string;
  durationSeconds: number;
}

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const FADE = 0.4;

/** Normalizes every generated clip to the same resolution/fps, trims each to
 *  its planned length, concatenates them into one timeline, and overlays the
 *  uploaded song (trimmed + faded to match) — producing one real, playable MP4. */
export async function assembleVideo(input: AssembleInput): Promise<AssembleResult> {
  const { clips, audioPath, outPath } = input;
  if (clips.length === 0) throw new Error('No clips to assemble');

  const totalSeconds = clips.reduce((sum, c) => sum + c.seconds, 0);
  const audioDuration = await getAudioDuration(audioPath);
  const usableAudioSeconds = Math.min(totalSeconds, audioDuration);
  const fadeOutStart = Math.max(0, usableAudioSeconds - FADE);

  const args: string[] = ['-y'];
  for (const clip of clips) {
    args.push('-t', clip.seconds.toFixed(3), '-i', clip.path);
  }
  args.push('-i', audioPath);

  const videoLabels: string[] = [];
  const filterParts: string[] = [];
  clips.forEach((_, i) => {
    const label = `v${i}`;
    filterParts.push(
      `[${i}:v]scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=increase,` +
        `crop=${WIDTH}:${HEIGHT},fps=${FPS},setsar=1,format=yuv420p[${label}]`
    );
    videoLabels.push(`[${label}]`);
  });
  filterParts.push(`${videoLabels.join('')}concat=n=${clips.length}:v=1:a=0[vout]`);

  const audioIndex = clips.length;
  filterParts.push(
    `[${audioIndex}:a]atrim=0:${usableAudioSeconds.toFixed(3)},` +
      `afade=t=in:st=0:d=${FADE},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE}[aout]`
  );

  args.push(
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-t', totalSeconds.toFixed(3),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    outPath
  );

  try {
    await execFileAsync('ffmpeg', args, { maxBuffer: 1024 * 1024 * 64 });
  } catch (err: any) {
    throw new Error(`ffmpeg assembly failed: ${err.stderr?.slice(-2000) || err.message}`);
  }

  const durationSeconds = await getAudioDuration(outPath);
  return { outPath, durationSeconds };
}
