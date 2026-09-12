export interface VideoGenInput {
  /** Absolute local filesystem path to the source photo. */
  imagePath: string;
  /** Cinematic direction: camera movement, mood, subject action. */
  prompt: string;
  /** Desired clip length in seconds. Providers may ignore this and return
   *  their native duration; the render stage trims to what's actually needed. */
  targetSeconds: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
}

export interface VideoGenResult {
  /** Absolute local filesystem path to the downloaded generated video file. */
  videoPath: string;
  /** Actual duration of the generated clip, probed after download. */
  durationSeconds: number;
  providerJobId: string;
}

export interface VideoGenProvider {
  name: string;
  generateClip(input: VideoGenInput): Promise<VideoGenResult>;
}

export class VideoGenError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'VideoGenError';
  }
}
