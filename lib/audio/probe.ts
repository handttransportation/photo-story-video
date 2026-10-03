import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/** Probes duration via ffprobe. Works for any media container (audio or
 *  video) despite the audio-flavored name — kept as one implementation so
 *  every duration check in the app (uploaded songs, generated clips, final
 *  MP4s) goes through the same code path. */
export async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const seconds = parseFloat(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`Could not determine media duration for ${filePath}`);
  return seconds;
}

export const getMediaDuration = getAudioDuration;

export type AudioEnergy = 'low' | 'medium' | 'high';

// Real (not fabricated) energy estimate derived from the actual uploaded track's
// mean loudness via ffmpeg's volumedetect filter. Louder/denser mixes tend to
// correlate with more energetic songs; this feeds the AI Director's camera-motion
// intensity, it does not attempt full tempo/beat detection for the MVP.
export async function estimateAudioEnergy(filePath: string): Promise<AudioEnergy> {
  try {
    const { stderr } = await execFileAsync('ffmpeg', [
      '-i', filePath,
      '-af', 'volumedetect',
      '-f', 'null',
      '-',
    ]);
    const match = stderr.match(/mean_volume:\s*(-?\d+(\.\d+)?)\s*dB/);
    if (!match) return 'medium';
    const meanDb = parseFloat(match[1]);
    if (meanDb >= -14) return 'high';
    if (meanDb >= -22) return 'medium';
    return 'low';
  } catch {
    return 'medium';
  }
}
