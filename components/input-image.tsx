'use client';

import { useEffect, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { Button } from './ui/button';
import { ErrorBanner } from './error-banner';
import {
  errorFromException,
  parseApiError,
  type ApiError,
} from '@/lib/api-error';
import { formatModelName } from '@/lib/format';
import { useWorkspace } from '@/lib/workspace-context';

export function InputImage() {
  const {
    imageFile,
    setImageFile,
    structuredPrompt,
    jobStatus,
    setJob,
    setJobStartedAt,
    videoModel,
    authHeaders,
  } = useWorkspace();
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  // Keep the preview in sync with the shared imageFile (which may be set by
  // direct upload here, or by the "Generate 1st Frame" pane).
  useEffect(() => {
    if (!imageFile) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImageFile(file);
    }
  };

  const clearImage = () => {
    setImageFile(null);
  };

  const handleSubmit = async () => {
    setError(null);
    if (!structuredPrompt.trim()) {
      setError({ message: 'Generate (or paste) a structured prompt first.' });
      return;
    }
    setSubmitting(true);
    setJob(null, 'queued');
    setJobStartedAt(null);
    try {
      const fd = new FormData();
      fd.append('prompt', structuredPrompt);
      if (imageFile) fd.append('image', imageFile);

      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const apiErr = await parseApiError(res);
        setError(apiErr);
        setJob(null, 'error', apiErr);
        return;
      }
      const { job_id } = (await res.json()) as { job_id: string };
      setJob(job_id, 'queued');
      setJobStartedAt(Date.now());
    } catch (e) {
      const apiErr = errorFromException(e, 'Failed to submit video job.');
      setError(apiErr);
      setJob(null, 'error', apiErr);
    } finally {
      setSubmitting(false);
    }
  };

  const generating = jobStatus === 'queued' || jobStatus === 'running';

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="image"
          className="text-lg font-semibold text-foreground"
        >
          3. Generate Video Short
        </label>
        <p className="text-sm text-muted-foreground">
          Send the structured prompt to Veo. The first frame from step 1
          anchors the clip — or upload your own here to override.
        </p>
      </div>
      <div className="relative flex items-center justify-center">
        <input
          id="image"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
        <div className="w-full border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary hover:bg-card/50 transition-colors">
          {preview ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={preview}
                alt="Preview"
                className="h-24 w-24 object-cover rounded-lg"
              />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">
                  {imageFile?.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  Click to change image
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-6 w-6 text-muted-foreground" />
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium text-foreground">
                  Drop image or click to browse
                </p>
                <p className="text-xs text-muted-foreground">
                  Optional. JPG, PNG, WebP, GIF.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {imageFile && (
        <button
          type="button"
          onClick={clearImage}
          className="self-start inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" /> Remove image
        </button>
      )}

      <ErrorBanner error={error} />

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {[formatModelName(videoModel) || 'Veo', '8s', '16:9']
            .filter(Boolean)
            .join(' · ')}
        </p>
        <Button
          onClick={handleSubmit}
          disabled={submitting || generating || !structuredPrompt.trim()}
          className="px-6"
        >
          {submitting
            ? 'Submitting…'
            : generating
              ? 'Generating…'
              : 'Gen Video'}
        </Button>
      </div>
    </div>
  );
}
