export interface PhotoInput {
  id: string;
  path: string;
  order: number;
}

export interface PhotoAnalysis {
  id: string;
  description: string;
  mood: string;
}

export type ShotRole = 'opening' | 'buildup' | 'hero' | 'closing';

export interface DirectorAnalysis {
  subject: string;
  locations: string;
  overallMood: string;
  photos: PhotoAnalysis[];
  /** Full recommended photo order (ids) telling the coherent visual story. */
  sequence: string[];
  /** Role assigned to each id in `sequence`, same length/order. */
  roles: ShotRole[];
}

export interface PhotoAnalyzer {
  name: string;
  analyze(photos: PhotoInput[], stylePrompt: string | undefined): Promise<DirectorAnalysis>;
}
