import { prisma } from '../db/client';
import { analyzePhotos } from '../analysis';
import { planStory } from '../planning/plan';
import { getVideoProvider } from '../providers/video';
import { assembleVideo } from '../render/assemble';
import { outputPathFor } from '../storage/local';
import { ProjectStatus, ShotStatus } from '../status';
import type { AudioEnergy } from '../audio/probe';

async function setProjectStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  await prisma.project.update({ where: { id }, data: { status, ...extra } });
}

/** The full Photo Story Video pipeline: analyze -> plan -> generate each shot
 *  with the video provider -> assemble with audio. Runs to completion or marks
 *  the project FAILED with a concrete reason; never fabricates output. */
export async function runPipeline(projectId: string): Promise<void> {
  try {
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { photos: true },
    });
    if (!project.audioPath) throw new Error('Project has no audio file');

    await setProjectStatus(projectId, ProjectStatus.ANALYZING, { errorMessage: null });
    const analysis = await analyzePhotos(
      project.photos.map((p) => ({ id: p.id, path: p.path, order: p.order })),
      project.stylePrompt ?? undefined
    );
    await prisma.project.update({
      where: { id: projectId },
      data: { analysisJson: JSON.stringify(analysis) },
    });

    await setProjectStatus(projectId, ProjectStatus.PLANNING);
    const energy = (project.audioEnergy as AudioEnergy) ?? 'medium';
    const plan = planStory(analysis, energy, project.stylePrompt ?? undefined);
    await prisma.project.update({ where: { id: projectId }, data: { planJson: JSON.stringify(plan) } });

    await prisma.shot.deleteMany({ where: { projectId } });
    const photoById = new Map(project.photos.map((p) => [p.id, p]));
    const shotRecords = await Promise.all(
      plan.shots.map((s) =>
        prisma.shot.create({
          data: {
            projectId,
            photoId: s.photoId,
            sequence: s.sequence,
            role: s.role,
            prompt: s.prompt,
            targetSeconds: s.targetSeconds,
            status: ShotStatus.PENDING,
          },
        })
      )
    );

    await setProjectStatus(projectId, ProjectStatus.GENERATING);
    const provider = getVideoProvider();

    const generatedClips: { path: string; seconds: number }[] = [];
    for (const shot of shotRecords) {
      const photo = photoById.get(shot.photoId);
      if (!photo) throw new Error(`Photo ${shot.photoId} not found for shot`);

      await prisma.shot.update({ where: { id: shot.id }, data: { status: ShotStatus.GENERATING } });
      try {
        const result = await provider.generateClip({
          imagePath: photo.path,
          prompt: shot.prompt,
          targetSeconds: shot.targetSeconds,
          aspectRatio: '9:16',
        });
        await prisma.shot.update({
          where: { id: shot.id },
          data: {
            status: ShotStatus.COMPLETE,
            providerName: provider.name,
            providerJobId: result.providerJobId,
            clipPath: result.videoPath,
            clipDuration: result.durationSeconds,
          },
        });
        generatedClips.push({
          path: result.videoPath,
          seconds: Math.min(shot.targetSeconds, result.durationSeconds),
        });
      } catch (err: any) {
        const message = err?.message ?? String(err);
        await prisma.shot.update({
          where: { id: shot.id },
          data: { status: ShotStatus.FAILED, errorMessage: message },
        });
        throw new Error(`Shot ${shot.sequence + 1}/${shotRecords.length} (${shot.role}) generation failed: ${message}`);
      }
    }

    await setProjectStatus(projectId, ProjectStatus.ASSEMBLING);
    const { absolutePath, publicUrl } = await outputPathFor(projectId);
    const assembled = await assembleVideo({
      clips: generatedClips,
      audioPath: project.audioPath,
      outPath: absolutePath,
    });

    await setProjectStatus(projectId, ProjectStatus.COMPLETE, {
      outputPath: publicUrl,
      outputDuration: assembled.durationSeconds,
    });
  } catch (err: any) {
    const message = err?.message ?? String(err);
    console.error(`[pipeline] project ${projectId} failed:`, err);
    await setProjectStatus(projectId, ProjectStatus.FAILED, { errorMessage: message });
  }
}
