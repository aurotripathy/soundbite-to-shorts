import { BasicPrompt } from '@/components/basic-prompt';
import { StructuredPrompt } from '@/components/structured-prompt';
import { InputImage } from '@/components/input-image';
import { VideoPlayer } from '@/components/video-player';
import { GroundingFrame } from '@/components/grounding-frame';
import { PromptsMenu } from '@/components/prompts-menu';
import { SettingsDialog } from '@/components/settings-dialog';
import { WorkspaceProvider } from '@/lib/workspace-context';

export default function Home() {
  return (
    <WorkspaceProvider>
      <div className="flex min-h-screen items-center justify-center font-sans">
        <main className="flex w-full max-w-7xl flex-col gap-8 px-6 py-16">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="/icon.png"
                  alt=""
                  aria-hidden="true"
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-xl"
                />
                <h1 className="text-4xl font-bold tracking-tight text-foreground">
                  Soundbite to Shorts
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <PromptsMenu />
                <SettingsDialog />
              </div>
            </div>
            <p className="text-lg text-muted-foreground">
              Generate short-form videos from soundbites
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 rounded-2xl border border-border/90 bg-card/20 p-5">
              <GroundingFrame />
            </div>
            <div className="flex flex-col gap-6 rounded-2xl border border-border/90 bg-card/20 p-5">
              <BasicPrompt />
              <StructuredPrompt />
            </div>
            <div className="flex flex-col gap-6 rounded-2xl border border-border/90 bg-card/20 p-5">
              <InputImage />
              <VideoPlayer />
            </div>
          </div>
        </main>
      </div>
    </WorkspaceProvider>
  );
}
