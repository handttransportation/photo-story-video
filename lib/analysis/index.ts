import { config } from '../config';
import { ClaudePhotoAnalyzer } from './claude';
import { HeuristicPhotoAnalyzer } from './heuristic';
import type { DirectorAnalysis, PhotoAnalyzer, PhotoInput } from './types';

export type { DirectorAnalysis, PhotoAnalysis, PhotoInput, PhotoAnalyzer, ShotRole } from './types';

/** Runs the best available photo analyzer, falling back to the heuristic
 *  (real pixel-statistics based) analyzer — and logging why — if Claude
 *  vision analysis fails or isn't configured, so photo analysis never blocks
 *  the whole pipeline. */
export async function analyzePhotos(
  photos: PhotoInput[],
  stylePrompt: string | undefined
): Promise<DirectorAnalysis> {
  if (config.anthropicApiKey) {
    try {
      const analyzer: PhotoAnalyzer = new ClaudePhotoAnalyzer(config.anthropicApiKey);
      return await analyzer.analyze(photos, stylePrompt);
    } catch (err) {
      console.error('[analysis] Claude analyzer failed, falling back to heuristic:', err);
    }
  }
  const fallback: PhotoAnalyzer = new HeuristicPhotoAnalyzer();
  return fallback.analyze(photos, stylePrompt);
}
