import type { DirectorAnalysis, PhotoAnalyzer, PhotoInput, ShotRole } from './types';

/** Fallback analyzer used when no ANTHROPIC_API_KEY is configured. Uses upload
 *  order as a proxy for story order (first photo = opening, last = closing,
 *  middle photos = buildup/hero) rather than any real visual understanding.
 *  Keeps the app fully functional without a vision API key, just less smart. */
export class HeuristicPhotoAnalyzer implements PhotoAnalyzer {
  name = 'heuristic';

  async analyze(photos: PhotoInput[], stylePrompt: string | undefined): Promise<DirectorAnalysis> {
    const sorted = [...photos].sort((a, b) => a.order - b.order);
    const sequence = sorted.map((p) => p.id);
    const roles: ShotRole[] = sequence.map((_, i) => {
      if (i === 0) return 'opening';
      if (i === sequence.length - 1) return 'closing';
      if (i === Math.floor(sequence.length / 2)) return 'hero';
      return 'buildup';
    });

    return {
      subject: 'the people and places in the uploaded photos',
      locations: 'various',
      overallMood: stylePrompt ? stylePrompt : 'warm, cinematic, nostalgic',
      photos: sorted.map((p) => ({ id: p.id, description: 'uploaded photo', mood: 'neutral' })),
      sequence,
      roles,
    };
  }
}
