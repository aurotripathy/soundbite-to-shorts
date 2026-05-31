'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Settings as SettingsIcon } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useWorkspace } from '@/lib/workspace-context';

/**
 * Settings dialog where the user pastes their own Gemini Developer API key.
 *
 * Key is stored in localStorage only. It's sent to our own API as an
 * X-Goog-Api-Key header, and the API uses it to construct a per-request
 * google-genai client. We never log or persist it server-side.
 */
export function SettingsDialog() {
  const { apiKey, setApiKey, serverNeedsKey } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (open) {
      setDraft(apiKey);
      setShowKey(false);
    }
  }, [open, apiKey]);

  const save = () => {
    setApiKey(draft.trim());
    setOpen(false);
  };

  const clear = () => {
    setDraft('');
    setApiKey('');
  };

  const hasKey = apiKey.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="relative gap-2 text-muted-foreground hover:text-foreground"
          aria-label="Open settings"
        >
          <SettingsIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
          {hasKey ? (
            <span
              className="h-2 w-2 rounded-full bg-emerald-500"
              aria-label="Using your API key"
              title="Using your API key"
            />
          ) : serverNeedsKey ? (
            <span
              className="h-2 w-2 rounded-full bg-amber-500"
              aria-label="No API key set"
              title="No API key set — generation will fail"
            />
          ) : null}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4" />
            API key
          </DialogTitle>
          <DialogDescription>
            Paste your Gemini Developer API key. It's stored only in your
            browser (<code className="rounded bg-muted px-1 py-0.5 text-xs">localStorage</code>) and
            sent to the backend as a header on each generation request.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="api-key"
              className="text-sm font-medium text-foreground"
            >
              Google AI Studio key
            </label>
            <div className="relative">
              <Input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="AIza…"
                autoComplete="off"
                spellCheck={false}
                className="pr-10 font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute inset-y-0 right-2 inline-flex items-center text-muted-foreground hover:text-foreground"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get one at{' '}
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                aistudio.google.com/app/apikey
              </a>
              . Veo access is required for the video step.
            </p>
          </div>

          {serverNeedsKey && !hasKey && draft.trim().length === 0 && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              The server has no default API key. Generation will fail until you
              save one here.
            </p>
          )}
          {!serverNeedsKey && !hasKey && draft.trim().length === 0 && (
            <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              Leaving this blank uses the server's default key (shared quota).
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {hasKey && (
            <Button
              type="button"
              variant="ghost"
              onClick={clear}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear saved key
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
