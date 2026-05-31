'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Download, Play } from 'lucide-react';
import { Button } from './ui/button';
import { ErrorBanner } from './error-banner';
import {
  errorFromException,
  type ApiError,
} from '@/lib/api-error';
import { formatElapsed, formatModelName } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace-context';

export function VideoPlayer() {
  const { jobId, jobStatus, jobError, jobStartedAt, setJob, videoModel } =
    useWorkspace();

  // 1s tick for the live elapsed counter while running.
  const [, force] = useState(0);
  useEffect(() => {
    if (jobStatus !== 'queued' && jobStatus !== 'running') return;
    const handle = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(handle);
  }, [jobStatus]);

  useEffect(() => {
    if (!jobId) return;
    if (jobStatus === 'done' || jobStatus === 'error') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/videos/${jobId}`);
        if (!r.ok) throw new Error(`status ${r.status}`);
        const body = (await r.json()) as {
          status: 'queued' | 'running' | 'done' | 'error';
          error: ApiError | null;
        };
        if (!cancelled) setJob(jobId, body.status, body.error ?? null);
      } catch (e) {
        if (!cancelled) {
          setJob(
            jobId,
            'error',
            errorFromException(e, 'Failed to poll job status.'),
          );
        }
      }
    };

    tick();
    const handle = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [jobId, jobStatus, setJob]);

  // Snapshot the elapsed time at the moment the job completes, so the badge
  // doesn't keep ticking past completion.
  const [completedElapsed, setCompletedElapsed] = useState<string | null>(null);
  useEffect(() => {
    if (jobStatus === 'done' && jobStartedAt && completedElapsed === null) {
      setCompletedElapsed(formatElapsed(Date.now() - jobStartedAt));
    }
    if (jobStatus !== 'done' && completedElapsed !== null) {
      setCompletedElapsed(null);
    }
  }, [jobStatus, jobStartedAt, completedElapsed]);

  const elapsedRunning =
    (jobStatus === 'queued' || jobStatus === 'running') && jobStartedAt
      ? formatElapsed(Date.now() - jobStartedAt)
      : null;

  const modelLabel = formatModelName(videoModel) || 'Veo';

  const description =
    jobStatus === 'queued'
      ? 'Queued…'
      : jobStatus === 'running'
        ? 'Generating clip… (typically 1–5 minutes)'
        : jobStatus === 'done'
          ? completedElapsed
            ? `Completed in ${completedElapsed}`
            : 'Done'
          : jobStatus === 'error'
            ? 'Failed'
            : 'Your video will appear here';

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Generated Video</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          className="relative w-full bg-black rounded-lg overflow-hidden flex items-center justify-center"
          style={{ aspectRatio: '16/9' }}
        >
          {jobStatus === 'done' && jobId ? (
            <video
              controls
              src={`/api/videos/${jobId}/file`}
              className="h-full w-full"
            />
          ) : jobStatus === 'error' ? (
            <div className="w-full p-4">
              <ErrorBanner
                error={jobError ?? { message: 'Video generation failed.' }}
              />
            </div>
          ) : jobStatus === 'queued' || jobStatus === 'running' ? (
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm">
                  {jobStatus === 'queued' ? 'Queued…' : 'Generating clip…'}
                </p>
                <p className="text-xs">
                  {[
                    modelLabel,
                    elapsedRunning ? `${elapsedRunning} elapsed` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-primary/20 p-4">
                <Play className="h-8 w-8 text-primary fill-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Video output will appear here
              </p>
            </div>
          )}
        </div>
        {jobStatus === 'done' && jobId && (
          <div className="flex justify-end">
            <Button asChild variant="secondary" size="sm">
              <a
                href={`/api/videos/${jobId}/file`}
                download={`soundbite-to-shorts-${jobId.slice(0, 8)}.mp4`}
              >
                <Download className="mr-1 h-4 w-4" />
                Download MP4
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
