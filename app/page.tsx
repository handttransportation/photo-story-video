'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_PHOTOS = 5;
const MAX_PHOTOS = 20;

type Phase = 'form' | 'uploading' | 'processing' | 'complete' | 'error';

interface ShotStatus {
  id: string;
  sequence: number;
  role: string;
  status: string;
  targetSeconds: number;
  clipDuration: number | null;
  errorMessage: string | null;
  providerName: string | null;
}

interface ConfigResponse {
  videoProvider: 'replicate' | 'mock';
  realVideoGenerationReady: boolean;
  aiDirectorReady: boolean;
}

interface ProjectStatusResponse {
  id: string;
  status: string;
  errorMessage: string | null;
  outputPath: string | null;
  outputDuration: number | null;
  audioFilename: string | null;
  analysis: { subject?: string; overallMood?: string } | null;
  shots: ShotStatus[];
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Ready to generate',
  ANALYZING: 'Analyzing your photos (AI Director)…',
  PLANNING: 'Planning the story & shot sequence…',
  GENERATING: 'Generating cinematic clips…',
  ASSEMBLING: 'Assembling final video with audio…',
  COMPLETE: 'Done',
  FAILED: 'Failed',
};

const STATUS_ORDER = ['DRAFT', 'ANALYZING', 'PLANNING', 'GENERATING', 'ASSEMBLING', 'COMPLETE'];

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Home() {
  const [photos, setPhotos] = useState<File[]>([]);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [stylePrompt, setStylePrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [formError, setFormError] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [status, setStatus] = useState<ProjectStatusResponse | null>(null);
  const [appConfig, setAppConfig] = useState<ConfigResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then(setAppConfig)
      .catch(() => setAppConfig(null));
  }, []);

  const photoPreviews = useRef<string[]>([]);

  useEffect(() => {
    photoPreviews.current.forEach((url) => URL.revokeObjectURL(url));
    photoPreviews.current = photos.map((f) => URL.createObjectURL(f));
    return () => photoPreviews.current.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  function onPhotosSelected(files: FileList | null) {
    if (!files) return;
    const next = [...photos, ...Array.from(files)].slice(0, MAX_PHOTOS);
    setPhotos(next);
    setFormError(null);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  }

  function onAudioSelected(file: File | null) {
    setAudioFile(file);
    setAudioDuration(null);
    if (!file) return;
    const url = URL.createObjectURL(file);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      setAudioDuration(audio.duration);
      URL.revokeObjectURL(url);
    });
  }

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    (id: string) => {
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/projects/${id}/status`);
          const data: ProjectStatusResponse = await res.json();
          setStatus(data);
          if (data.status === 'COMPLETE') {
            setPhase('complete');
            stopPolling();
          } else if (data.status === 'FAILED') {
            setPhase('error');
            setFormError(data.errorMessage ?? 'Generation failed.');
            stopPolling();
          }
        } catch {
          // transient network hiccup; keep polling
        }
      }, 2500);
    },
    [stopPolling]
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  async function createVideo() {
    setFormError(null);
    if (photos.length < MIN_PHOTOS || photos.length > MAX_PHOTOS) {
      setFormError(`Please select between ${MIN_PHOTOS} and ${MAX_PHOTOS} photos.`);
      return;
    }
    if (!audioFile) {
      setFormError('Please select a song/audio file.');
      return;
    }

    setPhase('uploading');
    try {
      const form = new FormData();
      photos.forEach((p) => form.append('photos', p));
      form.append('audio', audioFile);
      if (stylePrompt.trim()) form.append('stylePrompt', stylePrompt.trim());

      const uploadRes = await fetch('/api/projects', { method: 'POST', body: form });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error ?? 'Upload failed');

      setProjectId(uploadData.id);

      const genRes = await fetch(`/api/projects/${uploadData.id}/generate`, { method: 'POST' });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error ?? 'Could not start generation');

      setPhase('processing');
      pollStatus(uploadData.id);
    } catch (err: any) {
      setFormError(err.message ?? 'Something went wrong');
      setPhase('error');
    }
  }

  async function retry() {
    if (!projectId) return;
    setFormError(null);
    setPhase('processing');
    try {
      const genRes = await fetch(`/api/projects/${projectId}/generate`, { method: 'POST' });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error ?? 'Could not start generation');
      pollStatus(projectId);
    } catch (err: any) {
      setFormError(err.message ?? 'Something went wrong');
      setPhase('error');
    }
  }

  function startOver() {
    stopPolling();
    setPhotos([]);
    setAudioFile(null);
    setAudioDuration(null);
    setStylePrompt('');
    setPhase('form');
    setFormError(null);
    setProjectId(null);
    setStatus(null);
  }

  const isBusy = phase === 'uploading' || phase === 'processing';
  const progressIndex = status ? STATUS_ORDER.indexOf(status.status) : -1;
  const isTestMode = appConfig ? !appConfig.realVideoGenerationReady : false;

  return (
    <main className="min-h-screen bg-canvas text-white">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-semibold tracking-tight">Photo Story Video</h1>
          <p className="mt-2 text-white/60">
            Upload 5–20 photos and a song. We&apos;ll direct, generate, and cut a real 10–15 second cinematic story.
          </p>
          {appConfig && (
            <div
              className={`mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                isTestMode
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isTestMode ? 'bg-amber-400' : 'bg-emerald-400'}`} />
              {isTestMode
                ? 'Test mode — clips are placeholder motion, not real AI video (Replicate not enabled)'
                : 'Live — real AI video generation via Replicate'}
            </div>
          )}
        </header>

        {phase === 'form' || phase === 'error' ? (
          <div className="space-y-8">
            <section>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Photos ({photos.length}/{MAX_PHOTOS}, minimum {MIN_PHOTOS})
              </label>
              <div className="rounded-xl border border-dashed border-white/20 bg-panel p-4">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => onPhotosSelected(e.target.files)}
                  className="block w-full text-sm text-white/70 file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white file:cursor-pointer"
                />
                {photos.length > 0 && (
                  <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {photos.map((file, i) => (
                      <div key={i} className="group relative aspect-square overflow-hidden rounded-lg bg-black/40">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photoPreviews.current[i]}
                          alt={`Photo ${i + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-black/70 text-xs group-hover:flex"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section>
              <label className="mb-2 block text-sm font-medium text-white/80">Song / audio</label>
              <div className="rounded-xl border border-dashed border-white/20 bg-panel p-4">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => onAudioSelected(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-white/70 file:mr-4 file:rounded-lg file:border-0 file:bg-accent file:px-4 file:py-2 file:text-white file:cursor-pointer"
                />
                {audioFile && (
                  <p className="mt-3 text-sm text-white/60">
                    {audioFile.name} · {audioDuration ? formatDuration(audioDuration) : 'reading duration…'}
                  </p>
                )}
              </div>
            </section>

            <section>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Story / style prompt <span className="text-white/40">(optional)</span>
              </label>
              <textarea
                value={stylePrompt}
                onChange={(e) => setStylePrompt(e.target.value)}
                placeholder="e.g. warm golden-hour road trip, nostalgic and adventurous"
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-panel p-3 text-sm text-white placeholder:text-white/30 focus:border-accent focus:outline-none"
              />
            </section>

            {formError && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
                {formError}
                {projectId && phase === 'error' && (
                  <button onClick={retry} className="ml-3 underline">
                    Retry generation
                  </button>
                )}
              </div>
            )}

            <button
              onClick={createVideo}
              disabled={isBusy}
              className="w-full rounded-xl bg-accent py-3 font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {isBusy ? 'Working…' : 'Create Video'}
            </button>
          </div>
        ) : null}

        {(phase === 'uploading' || phase === 'processing') && (
          <div className="space-y-6 rounded-xl border border-white/10 bg-panel p-6">
            <div>
              <p className="text-lg font-medium">
                {phase === 'uploading' ? 'Uploading your photos & audio…' : STATUS_LABELS[status?.status ?? 'DRAFT']}
              </p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{
                    width: `${Math.max(8, ((progressIndex + 1) / STATUS_ORDER.length) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {status?.analysis?.subject && (
              <p className="text-sm text-white/60">
                AI Director: <span className="text-white/80">{status.analysis.subject}</span> ·{' '}
                {status.analysis.overallMood}
              </p>
            )}

            {status && status.shots.length > 0 && (
              <ul className="space-y-2">
                {status.shots.map((shot) => (
                  <li key={shot.id} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-white/70">
                      Shot {shot.sequence + 1} · {shot.role}
                    </span>
                    <span
                      className={
                        shot.status === 'COMPLETE'
                          ? 'text-emerald-400'
                          : shot.status === 'FAILED'
                            ? 'text-red-400'
                            : shot.status === 'GENERATING'
                              ? 'text-accent'
                              : 'text-white/40'
                      }
                    >
                      {shot.status === 'GENERATING' ? 'generating…' : shot.status.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {phase === 'complete' && status?.outputPath && (() => {
          const isMockOutput = status.shots.some((s) => s.providerName === 'mock');
          return (
            <div className="space-y-6">
              {isMockOutput && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-300">
                  This is a <strong>test render</strong>: real motion/timing/audio pipeline, but the clips are a
                  local placeholder pan/zoom effect, not AI-generated video (watermarked below). Enable Replicate
                  to produce the real cinematic version.
                </div>
              )}
              <div className="overflow-hidden rounded-xl border border-white/10 bg-panel">
                <video
                  src={status.outputPath}
                  controls
                  playsInline
                  className="mx-auto max-h-[70vh] w-auto bg-black"
                />
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-white/60">
                  Final duration: {formatDuration(status.outputDuration)} · Story: {status.analysis?.subject}
                </p>
                <a
                  href={status.outputPath}
                  download={`photo-story-video-${projectId}.mp4`}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110"
                >
                  Download {isMockOutput ? 'test MP4' : 'MP4'}
                </a>
              </div>
              <button onClick={startOver} className="text-sm text-white/50 underline">
                Start a new video
              </button>
            </div>
          );
        })()}
      </div>
    </main>
  );
}
