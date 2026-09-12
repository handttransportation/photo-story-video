import { NextRequest, NextResponse } from 'next/server';
import { createReadStream, statSync } from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { STORAGE_ROOT, type StorageBucket } from '@/lib/storage/local';

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
};

const VALID_BUCKETS: StorageBucket[] = ['uploads', 'generated', 'output'];

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const [bucket, filename] = params.path;
  if (!VALID_BUCKETS.includes(bucket as StorageBucket) || !filename || filename.includes('..')) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const absolutePath = path.join(STORAGE_ROOT, bucket, filename);
  let stat;
  try {
    stat = statSync(absolutePath);
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ext = path.extname(filename).replace(/^\./, '').toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const range = req.headers.get('range');

  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;
    const stream = createReadStream(absolutePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as any, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      },
    });
  }

  const stream = createReadStream(absolutePath);
  return new NextResponse(Readable.toWeb(stream) as any, {
    status: 200,
    headers: {
      'Content-Length': String(stat.size),
      'Content-Type': contentType,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
