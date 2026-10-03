import sharp from 'sharp';
import type { DirectorAnalysis, PhotoAnalysis, PhotoAnalyzer, PhotoInput, ShotRole } from './types';

interface PhotoMetrics {
  id: string;
  brightness: number; // 0-255, average across channels
  contrast: number; // average per-channel stdev, rough "visual interest" proxy
}

async function measurePhoto(id: string, filePath: string): Promise<PhotoMetrics> {
  try {
    const stats = await sharp(filePath).stats();
    const brightness = stats.channels.reduce((sum, c) => sum + c.mean, 0) / stats.channels.length;
    const contrast = stats.channels.reduce((sum, c) => sum + c.stdev, 0) / stats.channels.length;
    return { id, brightness, contrast };
  } catch {
    return { id, brightness: 128, contrast: 50 };
  }
}

function moodFor(brightness: number): string {
  if (brightness > 175) return 'bright and airy';
  if (brightness < 70) return 'moody and dramatic';
  return 'warm and balanced';
}

/** Fallback analyzer used when no ANTHROPIC_API_KEY is configured. Unlike a
 *  pure order-based guess, this actually measures each photo's real pixel
 *  statistics (brightness, contrast) via sharp to pick a mood and to find the
 *  most visually striking "hero" shot — it just doesn't attempt semantic
 *  understanding (who/what is in the photo) the way a real vision model can,
 *  and is honest about that in its output rather than fabricating detail. */
export class HeuristicPhotoAnalyzer implements PhotoAnalyzer {
  name = 'heuristic-visual';

  async analyze(photos: PhotoInput[], stylePrompt: string | undefined): Promise<DirectorAnalysis> {
    const sorted = [...photos].sort((a, b) => a.order - b.order);
    const metrics = await Promise.all(sorted.map((p) => measurePhoto(p.id, p.path)));
    const metricsById = new Map(metrics.map((m) => [m.id, m]));

    const avgBrightness = metrics.reduce((s, m) => s + m.brightness, 0) / metrics.length;
    const overallMood = stylePrompt || moodFor(avgBrightness);

    const sequence = sorted.map((p) => p.id);
    const openingId = sequence[0];
    const closingId = sequence[sequence.length - 1];
    const middleIds = sequence.slice(1, -1);

    const heroIds = [...middleIds]
      .sort((a, b) => (metricsById.get(b)?.contrast ?? 0) - (metricsById.get(a)?.contrast ?? 0))
      .slice(0, Math.min(2, middleIds.length));

    const roles: ShotRole[] = sequence.map((id) => {
      if (id === openingId) return 'opening';
      if (id === closingId) return 'closing';
      if (heroIds.includes(id)) return 'hero';
      return 'buildup';
    });

    const photoAnalyses: PhotoAnalysis[] = sorted.map((p) => {
      const m = metricsById.get(p.id)!;
      const contrastNote = m.contrast > 60 ? 'high-contrast, visually striking' : 'soft, low-contrast tones';
      return { id: p.id, description: `${moodFor(m.brightness)} scene, ${contrastNote}`, mood: moodFor(m.brightness) };
    });

    return {
      subject: 'the subjects and scenes across your uploaded photos',
      locations: 'various',
      overallMood,
      photos: photoAnalyses,
      sequence,
      roles,
    };
  }
}
