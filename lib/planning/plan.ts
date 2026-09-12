import type { AudioEnergy } from '../audio/probe';
import type { DirectorAnalysis, ShotRole } from '../analysis/types';

export interface PlannedShot {
  photoId: string;
  sequence: number;
  role: ShotRole;
  prompt: string;
  targetSeconds: number;
}

export interface StoryPlan {
  shots: PlannedShot[];
  totalSeconds: number;
}

const TOTAL_TARGET_SECONDS = 12; // within the requested 10-15s window
const MAX_SHOTS = 4;

const ENERGY_DIRECTION: Record<AudioEnergy, string> = {
  low: 'slow, graceful, dreamlike camera movement matching a calm, gentle song',
  medium: 'smooth, balanced camera movement with natural pacing',
  high: 'faster, more dynamic camera movement with energetic pacing matching an upbeat song',
};

const ROLE_DIRECTION: Record<ShotRole, string> = {
  opening: 'Cinematic opening shot. Slow, graceful push-in on the main subject to establish the scene.',
  buildup: 'Smooth tracking camera movement that gradually reveals more of the scene, subtle parallax.',
  hero: 'The emotional peak shot: a confident, striking camera move (slow orbit or dolly) with cinematic depth of field.',
  closing: 'Slow, graceful pull-back that resolves the story gently, warm cinematic closing feel.',
};

/** Picks a small, coherent subset of the AI Director's full sequence — always
 *  the opening and closing shots, plus up to two standout "hero" (falling back
 *  to "buildup") shots from the middle — and writes a directed cinematic prompt
 *  for each, so a handful of AI-generated clips can carry the whole story. */
export function planStory(
  analysis: DirectorAnalysis,
  energy: AudioEnergy,
  stylePrompt: string | undefined
): StoryPlan {
  const { sequence, roles } = analysis;
  const roleById = new Map(sequence.map((id, i) => [id, roles[i]]));

  const openingId = sequence[0];
  const closingId = sequence[sequence.length - 1];
  const middleIds = sequence.slice(1, -1);

  const heroMiddle = middleIds.filter((id) => roleById.get(id) === 'hero');
  const buildupMiddle = middleIds.filter((id) => roleById.get(id) === 'buildup');
  const middlePool = [...heroMiddle, ...buildupMiddle, ...middleIds];

  const middleSlots = Math.max(0, Math.min(MAX_SHOTS - 2, middlePool.length));
  const chosenMiddle: string[] = [];
  for (const id of middlePool) {
    if (chosenMiddle.length >= middleSlots) break;
    if (!chosenMiddle.includes(id)) chosenMiddle.push(id);
  }
  chosenMiddle.sort((a, b) => sequence.indexOf(a) - sequence.indexOf(b));

  const orderedIds = [openingId, ...chosenMiddle, closingId].filter(
    (id, i, arr) => id !== undefined && arr.indexOf(id) === i
  );

  const perShotSeconds = TOTAL_TARGET_SECONDS / orderedIds.length;
  const energyDirection = ENERGY_DIRECTION[energy];
  const styleClause = stylePrompt ? ` Overall style direction from the user: "${stylePrompt}".` : '';

  const shots: PlannedShot[] = orderedIds.map((photoId, i) => {
    const role = roleById.get(photoId) ?? (i === 0 ? 'opening' : i === orderedIds.length - 1 ? 'closing' : 'buildup');
    const photoDesc = analysis.photos.find((p) => p.id === photoId);
    const prompt = [
      ROLE_DIRECTION[role],
      `Mood: ${analysis.overallMood}.`,
      photoDesc ? `Scene: ${photoDesc.description}.` : undefined,
      energyDirection + '.',
      'Keep the subject consistent and realistic, avoid distortion, maintain natural continuity.',
      styleClause,
    ]
      .filter(Boolean)
      .join(' ');

    return { photoId, sequence: i, role, prompt, targetSeconds: perShotSeconds };
  });

  return { shots, totalSeconds: TOTAL_TARGET_SECONDS };
}
