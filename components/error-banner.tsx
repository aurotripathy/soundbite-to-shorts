'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/api-error';

export function ErrorBanner({
  error,
  className,
}: {
  error: ApiError | string | null | undefined;
  className?: string;
}) {
  const [showTech, setShowTech] = useState(false);

  if (!error) return null;
  const e: ApiError = typeof error === 'string' ? { message: error } : error;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 p-3',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-destructive">{e.message}</p>
          {e.hint && (
            <p className="text-xs leading-relaxed text-destructive/80">
              {e.hint}
            </p>
          )}
        </div>
      </div>
      {e.technical && (
        <div className="ml-6">
          <button
            type="button"
            onClick={() => setShowTech((v) => !v)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showTech ? 'Hide technical details' : 'Show technical details'}
          </button>
          {showTech && (
            <pre className="mt-1 max-h-40 overflow-auto rounded border border-border bg-background/60 p-2 text-[11px] leading-snug text-muted-foreground">
              {e.technical}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
