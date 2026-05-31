'use client';

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Maximize2, Plus, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ErrorBanner } from './error-banner';
import {
  errorFromException,
  parseApiError,
  type ApiError,
} from '@/lib/api-error';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace-context';

const MAX_STYLE_FRAMES = 4;

type StyleFrameEntry = {
  id: string;
  file: File;
  previewUrl: string;
};

export function GroundingFrame() {
  const {
    imageFile,
    setImageFile,
    groundingInstruction: instruction,
    setGroundingInstruction: setInstruction,
    authHeaders,
  } = useWorkspace();

  const [styleFrames, setStyleFrames] = useState<StyleFrameEntry[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Render the shared imageFile as the "generated frame" preview so it stays
  // in sync if another pane changes the reference image.
  const [framePreview, setFramePreview] = useState<string | null>(null);
  useEffect(() => {
    if (!imageFile) {
      setFramePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setFramePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Close the expanded lightbox with Escape and lock background scroll.
  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [expanded]);

  // Revoke style-frame preview URLs when entries are removed / on unmount.
  useEffect(() => {
    return () => {
      styleFrames.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addStyleFrames = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    const incoming = Array.from(files);
    const rejected = incoming.filter(
      (f) => !(f.type || '').toLowerCase().startsWith('image/'),
    );
    const accepted = incoming.filter((f) =>
      (f.type || '').toLowerCase().startsWith('image/'),
    );

    if (rejected.length > 0) {
      setError({
        code: 'CLIENT_FORMAT',
        message: `Skipped ${rejected.length} file(s) the browser did not detect as an image.`,
        hint:
          'Re-export as PNG, JPEG, or WebP. Affected: ' +
          rejected.map((f) => `${f.name} (${f.type || 'unknown'})`).join(', '),
      });
    }

    setStyleFrames((prev) => {
      const remaining = MAX_STYLE_FRAMES - prev.length;
      if (remaining <= 0) return prev;
      const additions: StyleFrameEntry[] = accepted
        .slice(0, remaining)
        .map((file) => ({
          id: `${file.name}-${file.size}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        }));
      return [...prev, ...additions];
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeStyleFrame = (id: string) => {
    setStyleFrames((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleGenerate = async () => {
    setError(null);
    if (!instruction.trim()) {
      setError({ message: 'Describe the first frame to generate.' });
      return;
    }
    setGenerating(true);
    try {
      const fd = new FormData();
      fd.append('instruction', instruction);
      styleFrames.forEach((entry) => {
        fd.append('style_frames', entry.file);
      });

      const res = await fetch('/api/grounding-frame', {
        method: 'POST',
        headers: authHeaders(),
        body: fd,
      });
      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }
      const blob = await res.blob();
      const mime = blob.type || 'image/png';
      const ext = mime.includes('jpeg') ? 'jpg' : 'png';
      const file = new File([blob], `grounding-frame.${ext}`, { type: mime });
      setImageFile(file);
    } catch (e) {
      setError(errorFromException(e, 'Failed to generate frame.'));
    } finally {
      setGenerating(false);
    }
  };

  const canAddMore = styleFrames.length < MAX_STYLE_FRAMES;
  const canGenerate = !generating && instruction.trim().length > 0;

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">
          1. Generate 1st Frame
        </h2>
        <p className="text-sm text-muted-foreground">
          Generate the first frame for the video. Add up to {MAX_STYLE_FRAMES}{' '}
          reference images and describe how to mix them.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">
            Style / base frames{' '}
            <span className="text-xs font-normal text-muted-foreground">
              (optional, up to {MAX_STYLE_FRAMES})
            </span>
          </label>
          <span className="text-xs text-muted-foreground">
            {styleFrames.length}/{MAX_STYLE_FRAMES}
          </span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => addStyleFrames(e.target.files)}
          className="hidden"
        />

        <div className="grid grid-cols-2 gap-2">
          {styleFrames.map((entry, idx) => (
            <div
              key={entry.id}
              className="relative overflow-hidden rounded-md border border-border bg-card/40"
            >
              <img
                src={entry.previewUrl}
                alt={`Reference frame ${idx + 1}`}
                className="h-24 w-full object-cover"
              />
              <div className="absolute left-1 top-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                #{idx + 1}
              </div>
              <button
                type="button"
                aria-label="Remove this frame"
                onClick={() => removeStyleFrame(entry.id)}
                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-background/80 text-foreground hover:bg-background"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {canAddMore && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-24 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-card/50 hover:text-foreground"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs">
                {styleFrames.length === 0 ? 'Add frame' : 'Add another'}
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="groundingInstruction"
          className="text-sm font-medium text-foreground"
        >
          Instruction
        </label>
        <Textarea
          id="groundingInstruction"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={
            styleFrames.length > 1
              ? 'e.g. Use the subject from frame 1, the lighting from frame 2, and the background from frame 3.'
              : 'e.g. A professor in a classroom full of students in front of the provided slide.'
          }
          className="min-h-24 resize-none"
        />
      </div>

      <ErrorBanner error={error} />

      <div className="flex justify-end">
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="px-4"
        >
          <Sparkles className="mr-1 h-4 w-4" />
          {generating
            ? 'Generating…'
            : framePreview
              ? 'Regenerate Frame'
              : 'Gen 1st Frame'}
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/40 p-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          Generated frame
        </div>
        {framePreview ? (
          <div className="relative">
            <img
              src={framePreview}
              alt="Generated grounding frame"
              className={cn(
                'w-full rounded-md object-contain transition-opacity',
                generating && 'opacity-40',
              )}
              style={{ aspectRatio: '16/9' }}
            />
            {!generating && (
              <button
                type="button"
                aria-label="Expand generated frame"
                onClick={() => setExpanded(true)}
                className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/70 text-foreground backdrop-blur-sm transition-colors hover:bg-background"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            )}
            {generating && (
              <div className="absolute inset-0 flex items-center justify-center rounded-md bg-background/40 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2 text-foreground">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <p className="text-xs">Regenerating frame…</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex w-full items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground"
            style={{ aspectRatio: '16/9' }}
          >
            {generating ? 'Generating…' : 'Frame will appear here'}
          </div>
        )}
      </div>

      {expanded && framePreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Generated frame preview"
          onClick={() => setExpanded(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label="Close expanded frame"
            onClick={() => setExpanded(false)}
            className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md bg-background/80 text-foreground transition-colors hover:bg-background"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={framePreview}
            alt="Generated grounding frame (expanded)"
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
