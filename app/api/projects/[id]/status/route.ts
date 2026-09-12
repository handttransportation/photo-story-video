import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { photos: { orderBy: { order: 'asc' } }, shots: { orderBy: { sequence: 'asc' } } },
  });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  let analysis: unknown = null;
  try {
    analysis = project.analysisJson ? JSON.parse(project.analysisJson) : null;
  } catch {
    analysis = null;
  }

  return NextResponse.json({
    id: project.id,
    status: project.status,
    errorMessage: project.errorMessage,
    stylePrompt: project.stylePrompt,
    audioFilename: project.audioFilename,
    audioDuration: project.audioDuration,
    audioEnergy: project.audioEnergy,
    outputPath: project.outputPath,
    outputDuration: project.outputDuration,
    analysis,
    photos: project.photos.map((p) => ({
      id: p.id,
      filename: p.filename,
      order: p.order,
      url: `/api/media/uploads/${p.path.split('/').pop()}`,
    })),
    shots: project.shots.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      role: s.role,
      status: s.status,
      targetSeconds: s.targetSeconds,
      clipDuration: s.clipDuration,
      errorMessage: s.errorMessage,
    })),
  });
}
