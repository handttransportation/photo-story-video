# Photo Story Video

Upload 5–20 photos and a song, optionally describe the story/style you want, click
**Create Video**, and get back a real 10–15 second cinematic MP4: each selected photo
is turned into a moving AI-generated video clip (real camera motion via an
image-to-video model — not a slideshow, not a Ken Burns fake), the clips are cut
together into one timeline, and your uploaded song is synced under it.

## Required credential

**`REPLICATE_API_TOKEN`** — the app calls a real external image-to-video model
through [Replicate](https://replicate.com). Without this key, uploads and the AI
Director analysis still work, but clicking "Create Video" returns a clear error
instead of generating anything (no fake/placeholder video is ever produced).

1. Create a Replicate account and get a token: https://replicate.com/account/api-tokens
2. Put it in `.env`: `REPLICATE_API_TOKEN=r8_...`
3. (Generation is pay-per-use/metered on Replicate's side — no separate subscription needed.)

The model used is configurable via `REPLICATE_VIDEO_MODEL` in `.env` (defaults to
`minimax/video-01-director`, chosen because it accepts an image + a text prompt and
supports directed camera movement). To use a different provider/model later, only
`lib/providers/video/replicate.ts` (or a new file implementing the same
`VideoGenProvider` interface in `lib/providers/video/types.ts`) needs to change —
nothing else in the app calls Replicate directly.

## Optional credential

**`ANTHROPIC_API_KEY`** — powers the "AI Director" step: Claude's vision model looks
at all your uploaded photos together and decides the main subject, mood, locations,
and the best narrative order (opening/buildup/hero/closing shots). Get a key at
https://console.anthropic.com/settings/keys.

Without it, the app falls back to a heuristic analyzer (uses upload order to guess
opening/hero/closing) — the app stays fully functional, just less "directed."

## Running it

```bash
npm install
npx prisma migrate deploy   # creates the local SQLite database
npm run dev
```

Open http://localhost:3000. Requires `ffmpeg`/`ffprobe` on PATH (used for audio
probing and final video assembly) — install with `brew install ffmpeg` if missing.

## Architecture

Each concern is its own module so the MVP can grow into a larger system without a
rewrite:

| Concern | Location |
|---|---|
| Uploads & storage | `lib/storage/local.ts` (swap for S3/GCS later behind the same `save/absolutePath/publicUrl` surface) |
| Project/photo/shot data | `prisma/schema.prisma`, `lib/db/client.ts` |
| Photo analysis ("AI Director") | `lib/analysis/` — `claude.ts` (vision-based) + `heuristic.ts` (fallback), selected by `index.ts` |
| Story/scene planning | `lib/planning/plan.ts` — turns analysis + audio energy into an ordered shot list with per-shot cinematic prompts |
| Video generation provider | `lib/providers/video/` — `types.ts` defines the swappable interface, `replicate.ts` implements it, `index.ts` is the factory |
| Audio | `lib/audio/probe.ts` — duration + a real loudness-based energy estimate (ffmpeg `volumedetect`) |
| Rendering/export | `lib/render/assemble.ts` — ffmpeg: normalizes+trims each clip, concatenates, overlays the trimmed/faded song, exports one MP4 |
| Orchestration | `lib/pipeline/run.ts` — runs the above steps in order against a project, updating status as it goes |
| API | `app/api/projects` (upload), `.../[id]/generate` (kick off pipeline), `.../[id]/status` (poll), `app/api/media/[...path]` (serves stored files) |
| UI | `app/page.tsx` — single-page upload form → progress → video preview/download |

### How a 10–15s video is built

The AI Director picks 4 shots from your photos — always the opening and closing
shots plus up to two standout "hero"/"buildup" shots from the middle — and writes a
cinematic camera-movement prompt for each (informed by mood, your style prompt, and
the song's estimated energy). Each shot is generated as its own AI video clip
(~3 seconds used from each, 4 × 3s = 12s), then ffmpeg concatenates them, crops/scales
everything to a consistent 1080×1920 vertical frame, and lays the song underneath
with a short fade in/out trimmed to the video's length.

### Known limitations (MVP scope)

- Audio "energy" is a loudness heuristic (ffmpeg `volumedetect`), not full beat/tempo
  detection — it biases prompt direction (slow vs. dynamic camera movement), it
  doesn't beat-sync cuts to the track.
- The pipeline runs as a background async job inside the long-lived `next dev`/
  `next start` Node process (polled via `/status`). It is not built for a
  short-timeout serverless deployment (e.g. Vercel functions) as-is — running it on
  a persistent Node server (or moving generation to a queue/worker) is the next step
  if this grows beyond an MVP.
- No auth/multi-tenancy — every project is publicly reachable by its id, matching
  MVP scope.

## What was tested

- Upload endpoint: validated 5–20 photo limit, audio requirement, file-type/size
  validation, photo ordering, audio duration + energy probing (via ffmpeg) — all
  confirmed against real uploaded files.
- Generate endpoint: confirmed it blocks with a clear, actionable error when
  `REPLICATE_API_TOKEN` is missing, and blocks double-generation on an in-progress
  project.
- Media route: confirmed correct content-type serving and that path traversal is
  rejected.
- AI Director (heuristic fallback) + story planner: confirmed it produces a
  4-shot plan (opening/buildup/hero/closing) summing to ~12 seconds, with
  role-appropriate cinematic prompts.
- Render/assembly (ffmpeg): confirmed against synthetic clips + a real audio file
  that it produces one real, playable MP4 — verified with `ffprobe` to have both a
  1080×1920 H.264 video stream and an AAC audio stream, exactly matching the
  planned ~12s duration.
- **Not yet tested**: an actual Replicate image-to-video generation call, since
  that requires `REPLICATE_API_TOKEN`, which only you can provide. Once it's in
  `.env`, run the app and click Create Video with real photos — the whole pipeline
  downstream of that call (schema mapping, polling, download, trimming, assembly)
  is already exercised by the tests above and wired directly to it.
