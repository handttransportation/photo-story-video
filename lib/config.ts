export type VideoProviderName = 'replicate' | 'mock';

/** Single place all environment configuration is read from. Keeps env-var
 *  names and defaults in one spot instead of scattered `process.env` reads,
 *  and is the one thing that needs to change to activate/swap the real
 *  video-generation provider. */
export const config = {
  videoProvider: (process.env.VIDEO_PROVIDER as VideoProviderName) || 'replicate',
  replicateApiToken: process.env.REPLICATE_API_TOKEN || '',
  replicateVideoModel: process.env.REPLICATE_VIDEO_MODEL || 'minimax/video-01-director',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
};

export function isRealVideoGenerationReady(): boolean {
  return config.videoProvider === 'replicate' && Boolean(config.replicateApiToken);
}

export function isAiDirectorReady(): boolean {
  return Boolean(config.anthropicApiKey);
}
