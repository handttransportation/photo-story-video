import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { prisma } from '@/lib/db/client';
import { saveBuffer, extensionFromFilename } from '@/lib/storage/local';
import { estimateAudioEnergy, getAudioDuration } from '@/lib/audio/probe';
import { ProjectStatus } from '@/lib/status';

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 20;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
const ALLOWED_AUDIO_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/ogg']);

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const photoFiles = form.getAll('photos').filter((f): f is File => f instanceof File);
    const audioFile = form.get('audio');
    const stylePrompt = (form.get('stylePrompt') as string | null)?.trim() || null;

    if (photoFiles.length < MIN_PHOTOS || photoFiles.length > MAX_PHOTOS) {
      return NextResponse.json(
        { error: `Please upload between ${MIN_PHOTOS} and ${MAX_PHOTOS} photos (got ${photoFiles.length}).` },
        { status: 400 }
      );
    }
    if (!(audioFile instanceof File)) {
      return NextResponse.json({ error: 'Please upload one audio file.' }, { status: 400 });
    }
    for (const f of photoFiles) {
      if (!ALLOWED_IMAGE_TYPES.has(f.type)) {
        return NextResponse.json({ error: `Unsupported photo type: ${f.type || 'unknown'}` }, { status: 400 });
      }
      if (f.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ error: `Photo "${f.name}" is too large (max 20MB).` }, { status: 400 });
      }
    }
    if (!ALLOWED_AUDIO_TYPES.has(audioFile.type)) {
      return NextResponse.json({ error: `Unsupported audio type: ${audioFile.type || 'unknown'}` }, { status: 400 });
    }
    if (audioFile.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Audio file is too large (max 40MB).' }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: { status: ProjectStatus.DRAFT, stylePrompt },
    });

    let order = 0;
    for (const file of photoFiles) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = extensionFromFilename(file.name) || 'jpg';
      const saved = await saveBuffer('uploads', buffer, ext);
      let width: number | undefined;
      let height: number | undefined;
      try {
        const meta = await sharp(saved.absolutePath).metadata();
        width = meta.width;
        height = meta.height;
      } catch {
        // non-fatal; preview/analysis still works without dimensions
      }
      await prisma.photo.create({
        data: {
          projectId: project.id,
          filename: file.name,
          path: saved.absolutePath,
          order: order++,
          width,
          height,
        },
      });
    }

    const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
    const audioExt = extensionFromFilename(audioFile.name) || 'mp3';
    const savedAudio = await saveBuffer('uploads', audioBuffer, audioExt);

    let audioDuration: number | null = null;
    let audioEnergy: string | null = null;
    try {
      audioDuration = await getAudioDuration(savedAudio.absolutePath);
      audioEnergy = await estimateAudioEnergy(savedAudio.absolutePath);
    } catch (err) {
      return NextResponse.json(
        { error: 'Could not read the audio file. Please upload a valid MP3/WAV/M4A file.' },
        { status: 400 }
      );
    }

    const updated = await prisma.project.update({
      where: { id: project.id },
      data: {
        audioPath: savedAudio.absolutePath,
        audioFilename: audioFile.name,
        audioDuration,
        audioEnergy,
      },
      include: { photos: true },
    });

    return NextResponse.json({
      id: updated.id,
      status: updated.status,
      photoCount: updated.photos.length,
      audioFilename: updated.audioFilename,
      audioDuration: updated.audioDuration,
    });
  } catch (err: any) {
    console.error('[api/projects] error:', err);
    return NextResponse.json({ error: err?.message ?? 'Upload failed' }, { status: 500 });
  }
}
