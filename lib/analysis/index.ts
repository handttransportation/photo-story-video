import { ClaudePhotoAnalyzer } from './claude';
import { HeuristicPhotoAnalyzer } from './heuristic';
import type { DirectorAnalysis, PhotoAnalyzer, PhotoInput } from './types';

export type { DirectorAnalysis, PhotoAnalysis, PhotoInput, PhotoAnalyzer, ShotRole } from './types';

/** Runs the best available photo analyzer, falling back to the heuristic
 *  analyzer (and logging why) if Claude vision analysis fails or isn't configured,
 *  so photo analysis never blocks the whole pipeline. */
export async function analyzePhotos(
  photos: PhotoInput[],
  stylePrompt: string | undefined
): Promise<DirectorAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    try {
      const analyzer: PhotoAnalyzer = new ClaudePhotoAnalyzer(apiKey);
      return await analyzer.analyze(photos, stylePrompt);
    } catch (err) {
      console.error('[analysis] Claude analyzer failed, falling back to heuristic:', err);
    }
  }
  const fallback: PhotoAnalyzer = new HeuristicPhotoAnalyzer();
  return fallback.analyze(photos, stylePrompt);
}
