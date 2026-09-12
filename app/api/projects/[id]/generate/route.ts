import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { runPipeline } from '@/lib/pipeline/run';
import { ProjectStatus } from '@/lib/status';

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({ where: { id: params.id }, include: { photos: true } });
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (!project.audioPath) return NextResponse.json({ error: 'Project has no audio uploaded' }, { status: 400 });
  if (project.photos.length < 5) return NextResponse.json({ error: 'Project needs at least 5 photos' }, { status: 400 });

  if (!process.env.REPLICATE_API_TOKEN) {
    return NextResponse.json(
      {
        error:
          'REPLICATE_API_TOKEN is not configured on the server. Add it to .env (see .env.example) to enable real video generation.',
      },
      { status: 503 }
    );
  }

  if (project.status === ProjectStatus.GENERATING || project.status === ProjectStatus.ANALYZING || project.status === ProjectStatus.PLANNING || project.status === ProjectStatus.ASSEMBLING) {
    return NextResponse.json({ error: 'This project is already generating' }, { status: 409 });
  }

  await prisma.project.update({ where: { id: project.id }, data: { status: ProjectStatus.ANALYZING, errorMessage: null } });
  runPipeline(project.id).catch((err) => console.error('[generate] unhandled pipeline error:', err));

  return NextResponse.json({ status: ProjectStatus.ANALYZING });
}
