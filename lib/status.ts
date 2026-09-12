export const ProjectStatus = {
  DRAFT: 'DRAFT',
  ANALYZING: 'ANALYZING',
  PLANNING: 'PLANNING',
  GENERATING: 'GENERATING',
  ASSEMBLING: 'ASSEMBLING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const ShotStatus = {
  PENDING: 'PENDING',
  GENERATING: 'GENERATING',
  COMPLETE: 'COMPLETE',
  FAILED: 'FAILED',
} as const;
export type ShotStatus = (typeof ShotStatus)[keyof typeof ShotStatus];
