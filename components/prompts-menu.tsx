'use client';

import { useRef, useState } from 'react';
import {
  Database,
  Download,
  RotateCcw,
  Upload,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useWorkspace } from '@/lib/workspace-context';

/**
 * Workspace data menu — sits next to the Settings button in the page header.
 *
 *  - Export prompts (JSON)  -> downloads a snapshot of all typed text
 *  - Import prompts (JSON)  -> file picker, validates, hydrates the context
 *  - Reset prompts          -> confirm, then wipe all typed text + uploads
 *
 * Intentionally NOT inside the Settings dialog: that dialog is for
 * account-level config (the API key). This menu is for workspace data
 * management, which belongs next to the data.
 */
export function PromptsMenu() {
  const { exportSnapshot, importSnapshot, resetWorkspace } = useWorkspace();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const showFeedback = (kind: 'success' | 'error', message: string) => {
    setFeedback({ kind, message });
    window.setTimeout(() => setFeedback(null), 3500);
  };

  const handleExport = () => {
    try {
      const snapshot = exportSnapshot();
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const stamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .slice(0, 19);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soundbite-to-shorts-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showFeedback('success', 'Prompts exported.');
    } catch (e) {
      showFeedback('error', `Export failed: ${(e as Error).message}`);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    // Reset the input so re-importing the same file fires onChange again.
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      const ok = importSnapshot(parsed);
      if (!ok) {
        showFeedback(
          'error',
          'File is not a valid Soundbite-to-Shorts snapshot (expected `version: 1`).',
        );
        return;
      }
      showFeedback('success', `Imported ${file.name}.`);
    } catch (e) {
      showFeedback('error', `Import failed: ${(e as Error).message}`);
    }
  };

  const handleResetConfirm = () => {
    resetWorkspace();
    setResetOpen(false);
    showFeedback('success', 'Prompts reset.');
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {feedback && (
          <span
            role="status"
            className={
              feedback.kind === 'success'
                ? 'text-xs text-emerald-400'
                : 'text-xs text-rose-400'
            }
          >
            {feedback.message}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-muted-foreground hover:text-foreground"
              aria-label="Open prompts menu"
            >
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">Prompts</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              Export prompts (JSON)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleImportClick}>
              <Upload className="mr-2 h-4 w-4" />
              Import prompts (JSON)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => setResetOpen(true)}
              className="text-rose-300 focus:bg-rose-500/10 focus:text-rose-200"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset prompts…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportFile}
          className="hidden"
        />
      </div>

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all prompts?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears the 8 keyword fields, the structured prompt, the
              grounding instruction, and any uploaded image. Your API key is
              kept. There's no undo — consider exporting first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetConfirm}
              className="bg-rose-600 hover:bg-rose-500"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
