import { readFile } from 'fs/promises';
import path from 'path';
import { saveBuffer } from '../../storage/local';
import { getAudioDuration as probeDuration } from '../../audio/probe';
import { VideoGenError, type VideoGenInput, type VideoGenProvider, type VideoGenResult } from './types';

const REPLICATE_API = 'https://api.replicate.com/v1';
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 6 * 60 * 1000;

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Uploads a local file to Replicate's Files API so it can be referenced by URL in a prediction. */
async function uploadFile(token: string, absolutePath: string): Promise<string> {
  const buffer = await readFile(absolutePath);
  const filename = path.basename(absolutePath);
  const form = new FormData();
  form.append('content', new Blob([buffer]), filename);

  const res = await fetch(`${REPLICATE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    throw new VideoGenError(`Replicate file upload failed (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  const url = data?.urls?.get;
  if (!url) throw new VideoGenError('Replicate file upload did not return a usable URL');
  return url;
}

interface InputSchemaProperty {
  type?: string;
  enum?: (string | number)[];
}

/** Fetches the model's current input schema so we can map our generic
 *  {image, prompt, duration} fields onto whatever field names this specific
 *  model actually uses, instead of hardcoding names that can drift or vary
 *  by provider/model. */
async function fetchInputSchema(
  token: string,
  owner: string,
  name: string
): Promise<Record<string, InputSchemaProperty>> {
  const res = await fetch(`${REPLICATE_API}/models/${owner}/${name}`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new VideoGenError(
      `Could not look up Replicate model "${owner}/${name}" (${res.status}). Check REPLICATE_VIDEO_MODEL and that your token has access.`
    );
  }
  const data = await res.json();
  const schema = data?.latest_version?.openapi_schema?.components?.schemas?.Input?.properties;
  if (!schema) {
    throw new VideoGenError(`Replicate model "${owner}/${name}" has no readable input schema`);
  }
  return schema;
}

function pickKey(props: Record<string, unknown>, candidates: string[]): string | undefined {
  return candidates.find((c) => c in props);
}

function closestEnumValue(enumValues: (string | number)[], target: number): string | number {
  let best = enumValues[0];
  let bestDiff = Infinity;
  for (const v of enumValues) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (Number.isNaN(n)) continue;
    const diff = Math.abs(n - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = v;
    }
  }
  return best;
}

export class ReplicateVideoProvider implements VideoGenProvider {
  name = 'replicate';
  private token: string;
  private owner: string;
  private model: string;

  constructor(token: string, modelSlug: string) {
    this.token = token;
    const parts = modelSlug.split('/');
    if (parts.length !== 2) {
      throw new VideoGenError(`REPLICATE_VIDEO_MODEL must be "owner/name", got "${modelSlug}"`);
    }
    [this.owner, this.model] = parts;
  }

  async generateClip(input: VideoGenInput): Promise<VideoGenResult> {
    const schema = await fetchInputSchema(this.token, this.owner, this.model);
    const imageKey = pickKey(schema, ['first_frame_image', 'image', 'start_image', 'input_image', 'image_url']);
    const promptKey = pickKey(schema, ['prompt', 'text_prompt', 'instruction']);
    const durationKey = pickKey(schema, ['duration', 'duration_seconds', 'video_length']);
    const aspectKey = pickKey(schema, ['aspect_ratio', 'ratio']);

    if (!imageKey) {
      throw new VideoGenError(
        `Replicate model "${this.owner}/${this.model}" has no recognizable image input field`
      );
    }

    const imageUrl = await uploadFile(this.token, input.imagePath);

    const body: Record<string, unknown> = { [imageKey]: imageUrl };
    if (promptKey) body[promptKey] = input.prompt;
    if (durationKey) {
      const enumValues = schema[durationKey].enum;
      body[durationKey] = enumValues
        ? closestEnumValue(enumValues, input.targetSeconds)
        : Math.round(input.targetSeconds);
    }
    if (aspectKey && input.aspectRatio) body[aspectKey] = input.aspectRatio;

    const createRes = await fetch(`${REPLICATE_API}/models/${this.owner}/${this.model}/predictions`, {
      method: 'POST',
      headers: authHeaders(this.token),
      body: JSON.stringify({ input: body }),
    });
    if (!createRes.ok) {
      throw new VideoGenError(
        `Replicate prediction creation failed (${createRes.status}): ${await createRes.text()}`
      );
    }
    const prediction = await createRes.json();
    const predictionId = prediction.id;

    const finalStatus = await this.pollUntilDone(predictionId);
    if (finalStatus.status !== 'succeeded') {
      throw new VideoGenError(
        `Replicate generation failed: ${finalStatus.error ?? finalStatus.status}`
      );
    }

    const output = finalStatus.output;
    const videoUrl = Array.isArray(output) ? output[0] : output;
    if (!videoUrl || typeof videoUrl !== 'string') {
      throw new VideoGenError('Replicate prediction succeeded but returned no video URL');
    }

    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) throw new VideoGenError(`Failed to download generated clip (${videoRes.status})`);
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
    const saved = await saveBuffer('generated', videoBuffer, 'mp4');
    const durationSeconds = await probeDuration(saved.absolutePath);

    return { videoPath: saved.absolutePath, durationSeconds, providerJobId: predictionId };
  }

  private async pollUntilDone(predictionId: string): Promise<any> {
    const started = Date.now();
    while (Date.now() - started < MAX_POLL_MS) {
      const res = await fetch(`${REPLICATE_API}/predictions/${predictionId}`, {
        headers: authHeaders(this.token),
      });
      if (!res.ok) throw new VideoGenError(`Failed to poll prediction status (${res.status})`);
      const data = await res.json();
      if (data.status === 'succeeded' || data.status === 'failed' || data.status === 'canceled') {
        return data;
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new VideoGenError('Timed out waiting for Replicate generation to complete');
  }
}
