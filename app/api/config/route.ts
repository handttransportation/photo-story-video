import { NextResponse } from 'next/server';
import { config, isAiDirectorReady, isRealVideoGenerationReady } from '@/lib/config';

/** Lets the UI know which provider is actually active, so it can show an
 *  honest "test mode" banner instead of implying every render is real AI
 *  video. Also useful for verifying deployment configuration at a glance. */
export async function GET() {
  return NextResponse.json({
    videoProvider: config.videoProvider,
    realVideoGenerationReady: isRealVideoGenerationReady(),
    aiDirectorReady: isAiDirectorReady(),
  });
}
