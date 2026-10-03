import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

// Local-disk storage backend. Swappable: replace this module with an S3/GCS
// implementation later without touching callers, as long as it keeps this
// same {save, absolutePath, publicUrl} surface.

export const STORAGE_ROOT = path.join(process.cwd(), 'storage');

export type StorageBucket = 'uploads' | 'generated' | 'output';

export async function saveBuffer(
  bucket: StorageBucket,
  buffer: Buffer,
  extension: string
): Promise<{ filename: string; absolutePath: string; publicUrl: string }> {
  const dir = path.join(STORAGE_ROOT, bucket);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${extension.replace(/^\./, '')}`;
  const absolutePath = path.join(dir, filename);
  await writeFile(absolutePath, buffer);
  return { filename, absolutePath, publicUrl: `/api/media/${bucket}/${filename}` };
}

/** Reserves a fresh path in a bucket for a caller (e.g. ffmpeg) that writes the
 *  file itself, rather than handing us a buffer to save. */
export async function preparePath(
  bucket: StorageBucket,
  extension: string
): Promise<{ absolutePath: string; publicUrl: string }> {
  const dir = path.join(STORAGE_ROOT, bucket);
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${extension.replace(/^\./, '')}`;
  return { absolutePath: path.join(dir, filename), publicUrl: `/api/media/${bucket}/${filename}` };
}

export function absolutePathFor(bucket: StorageBucket, filename: string): string {
  return path.join(STORAGE_ROOT, bucket, filename);
}

export function publicUrlFor(bucket: StorageBucket, filename: string): string {
  return `/api/media/${bucket}/${filename}`;
}

export async function outputPathFor(projectId: string): Promise<{ absolutePath: string; publicUrl: string }> {
  const dir = path.join(STORAGE_ROOT, 'output');
  await mkdir(dir, { recursive: true });
  const filename = `${projectId}.mp4`;
  return { absolutePath: path.join(dir, filename), publicUrl: `/api/media/output/${filename}` };
}

export function extensionFromFilename(filename: string): string {
  const ext = path.extname(filename).replace(/^\./, '');
  return ext || 'bin';
}
