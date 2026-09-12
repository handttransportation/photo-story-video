import sharp from 'sharp';
import type { DirectorAnalysis, PhotoAnalyzer, PhotoInput, ShotRole } from './types';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const VALID_ROLES: ShotRole[] = ['opening', 'buildup', 'hero', 'closing'];

async function toBase64Jpeg(filePath: string): Promise<string> {
  const buffer = await sharp(filePath)
    .rotate()
    .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return buffer.toString('base64');
}

/** AI Director analysis powered by Claude's vision model: looks at every uploaded
 *  photo together and decides subject, mood, locations, and the best narrative
 *  order (opening/buildup/hero/closing) for a short music-video-style edit. */
export class ClaudePhotoAnalyzer implements PhotoAnalyzer {
  name = 'claude';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'claude-sonnet-5') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(photos: PhotoInput[], stylePrompt: string | undefined): Promise<DirectorAnalysis> {
    const sorted = [...photos].sort((a, b) => a.order - b.order);

    const imageBlocks = await Promise.all(
      sorted.map(async (photo, i) => {
        const data = await toBase64Jpeg(photo.path);
        return [
          { type: 'text', text: `Photo ${i + 1} (id="${photo.id}"):` },
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        ];
      })
    );

    const instructions = `You are the AI creative director for a short cinematic music-video-style edit made from a person's photos.
You will see ${sorted.length} photos, each labeled with its id. Study them together and decide:
- the main subject(s) across the set
- notable locations/settings
- the overall visual mood
- a coherent narrative sequence (which photo should come first, which should close it, and how the rest flow between them)
- a role for every photo in that sequence: "opening", "buildup", "hero" (the strongest/most striking shot), or "closing"

${stylePrompt ? `The user requested this style/story: "${stylePrompt}". Honor it.` : 'No specific style was requested — use your best cinematic judgment.'}

Respond with ONLY raw JSON (no markdown code fences, no commentary) matching exactly this shape:
{
  "subject": string,
  "locations": string,
  "overallMood": string,
  "photos": [{ "id": string, "description": string, "mood": string }, ...one per photo],
  "sequence": [string, ...every photo id, ordered for the story],
  "roles": [string, ...same length/order as sequence, each one of "opening"|"buildup"|"hero"|"closing"]
}`;

    const res = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: instructions }, ...imageBlocks.flat()],
          },
        ],
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('Anthropic response had no text content');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Could not find JSON in Anthropic response');
    const parsed = JSON.parse(jsonMatch[0]);

    const validIds = new Set(sorted.map((p) => p.id));
    const sequence: string[] = (parsed.sequence ?? []).filter((id: string) => validIds.has(id));
    for (const id of validIds) {
      if (!sequence.includes(id)) sequence.push(id);
    }
    const roles: ShotRole[] = sequence.map((_: string, i: number) => {
      const r = parsed.roles?.[i];
      return VALID_ROLES.includes(r) ? r : i === 0 ? 'opening' : i === sequence.length - 1 ? 'closing' : 'buildup';
    });

    return {
      subject: parsed.subject ?? 'the people and places in the photos',
      locations: parsed.locations ?? 'various',
      overallMood: parsed.overallMood ?? 'cinematic',
      photos: sorted.map((p) => {
        const found = parsed.photos?.find((ph: any) => ph.id === p.id);
        return { id: p.id, description: found?.description ?? 'photo', mood: found?.mood ?? 'neutral' };
      }),
      sequence,
      roles,
    };
  }
}
