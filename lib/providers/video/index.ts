import { ReplicateVideoProvider } from './replicate';
import type { VideoGenProvider } from './types';

export { VideoGenError } from './types';
export type { VideoGenInput, VideoGenResult, VideoGenProvider } from './types';

export function getVideoProvider(): VideoGenProvider {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      'REPLICATE_API_TOKEN is not set. Add it to .env to enable real video generation (see .env.example).'
    );
  }
  const model = process.env.REPLICATE_VIDEO_MODEL || 'minimax/video-01-director';
  return new ReplicateVideoProvider(token, model);
}
