import { config } from '../../config';
import { MockVideoProvider } from './mock';
import { ReplicateVideoProvider } from './replicate';
import type { VideoGenProvider } from './types';

export { VideoGenError } from './types';
export type { VideoGenInput, VideoGenResult, VideoGenProvider } from './types';

/** The one place that decides which video-generation backend runs.
 *  Set VIDEO_PROVIDER=mock in .env to exercise the entire app (timeline,
 *  audio sync, ffmpeg assembly, export) without spending Replicate credit —
 *  every mock clip is clearly watermarked as a test fixture, never a real
 *  AI result. Set VIDEO_PROVIDER=replicate (the default) with a funded
 *  REPLICATE_API_TOKEN to produce real AI-generated video; nothing else in
 *  the app needs to change to make that switch. */
export function getVideoProvider(): VideoGenProvider {
  if (config.videoProvider === 'mock') {
    return new MockVideoProvider();
  }

  if (!config.replicateApiToken) {
    throw new Error(
      'REPLICATE_API_TOKEN is not set. Add it to .env to enable real video generation (see .env.example), ' +
        'or set VIDEO_PROVIDER=mock to test the rest of the app without it.'
    );
  }
  return new ReplicateVideoProvider(config.replicateApiToken, config.replicateVideoModel);
}
