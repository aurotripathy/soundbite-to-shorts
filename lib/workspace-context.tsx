'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { ApiError } from '@/lib/api-error';

export type KeywordKey =
  | 'subject'
  | 'action'
  | 'scene'
  | 'style'
  | 'cameraAngle'
  | 'cameraMovement'
  | 'soundEffects'
  | 'dialogue';

export type Keywords = Record<KeywordKey, string>;

export type JobStatus = 'idle' | 'queued' | 'running' | 'done' | 'error';

type WorkspaceState = {
  keywords: Keywords;
  setKeyword: (key: KeywordKey, value: string) => void;

  structuredPrompt: string;
  setStructuredPrompt: (value: string) => void;

  groundingInstruction: string;
  setGroundingInstruction: (value: string) => void;

  imageFile: File | null;
  setImageFile: (file: File | null) => void;

  jobId: string | null;
  jobStatus: JobStatus;
  jobError: ApiError | null;
  jobStartedAt: number | null;
  setJob: (
    id: string | null,
    status: JobStatus,
    error?: ApiError | null,
  ) => void;
  setJobStartedAt: (timestamp: number | null) => void;

  videoModel: string | null;

  /** User-supplied Gemini Developer API key. Persisted in localStorage. */
  apiKey: string;
  setApiKey: (value: string) => void;

  /** True when the server reports it has no GOOGLE_API_KEY of its own —
   *  i.e. the user MUST provide one in the Settings dialog. */
  serverNeedsKey: boolean;

  /** Convenience: headers to spread into fetch() so the backend can pick
   *  up the user's key. Returns {} when the user hasn't entered one
   *  (server falls back to its own key, if configured). */
  authHeaders: () => Record<string, string>;

  /** Snapshot of all user-typed prompt data, for Export-to-JSON. The
   *  shape is intentionally identical to what we persist in localStorage. */
  exportSnapshot: () => SavedState;

  /** Replace all user-typed prompt data with a snapshot (e.g. one loaded
   *  from a JSON file). Returns true on success, false if the payload
   *  doesn't match the expected schema. */
  importSnapshot: (raw: unknown) => boolean;

  /** Clear all user-typed prompt data (keywords + structured prompt +
   *  grounding instruction + uploaded image). Does NOT touch the API key. */
  resetWorkspace: () => void;
};

const Ctx = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('useWorkspace must be used inside <WorkspaceProvider>');
  }
  return value;
}

const EMPTY_KEYWORDS: Keywords = {
  subject: '',
  action: '',
  scene: '',
  style: '',
  cameraAngle: '',
  cameraMovement: '',
  soundEffects: '',
  dialogue: '',
};

/**
 * Persistence — auto-save / auto-restore of the text fields the user types
 * into. Files (image uploads) are intentionally NOT persisted because File
 * objects can't be serialized into localStorage and re-encoding to base64
 * would balloon storage. Re-upload after refresh is the trade-off.
 *
 * Schema is versioned so we can ignore stale payloads cleanly during dev.
 */
const STORAGE_KEY = 'gen-video:workspace:v1';
// API key is stored separately so it survives a "reset workspace" and so
// curious humans can clear it independently. Never sent to any server other
// than via the X-Goog-Api-Key header to our own /api/* (which forwards it
// only to Google).
const API_KEY_STORAGE_KEY = 'gen-video:api-key:v1';

export type SavedState = {
  version: 1;
  keywords: Keywords;
  structuredPrompt: string;
  groundingInstruction: string;
};

/** True iff `raw` looks like a valid SavedState. Tolerates missing keyword
 *  fields (treats them as ""), rejects anything with the wrong shape. */
function isSavedState(raw: unknown): raw is Partial<SavedState> {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return false;
  if (o.keywords !== undefined && typeof o.keywords !== 'object') return false;
  if (
    o.structuredPrompt !== undefined &&
    typeof o.structuredPrompt !== 'string'
  )
    return false;
  if (
    o.groundingInstruction !== undefined &&
    typeof o.groundingInstruction !== 'string'
  )
    return false;
  return true;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [keywords, setKeywords] = useState<Keywords>(EMPTY_KEYWORDS);
  const setKeyword = (key: KeywordKey, value: string) =>
    setKeywords((prev) => ({ ...prev, [key]: value }));

  const [structuredPrompt, setStructuredPrompt] = useState('');
  const [groundingInstruction, setGroundingInstruction] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);

  // ---- restore on first mount (client-side only) -------------------------
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as Partial<SavedState>;
        if (data && data.version === 1) {
          if (data.keywords) {
            setKeywords({ ...EMPTY_KEYWORDS, ...data.keywords });
          }
          if (typeof data.structuredPrompt === 'string') {
            setStructuredPrompt(data.structuredPrompt);
          }
          if (typeof data.groundingInstruction === 'string') {
            setGroundingInstruction(data.groundingInstruction);
          }
          console.debug('[workspace] restored from localStorage');
        }
      }
    } catch (e) {
      console.warn('[workspace] restore failed:', e);
    } finally {
      setRestored(true);
    }
  }, []);

  // ---- save whenever any persisted field changes -------------------------
  useEffect(() => {
    if (!restored) return; // don't overwrite saved data with initial empty state
    try {
      const payload: SavedState = {
        version: 1,
        keywords,
        structuredPrompt,
        groundingInstruction,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('[workspace] save failed:', e);
    }
  }, [restored, keywords, structuredPrompt, groundingInstruction]);

  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('idle');
  const [jobError, setJobError] = useState<ApiError | null>(null);
  const [jobStartedAt, setJobStartedAt] = useState<number | null>(null);

  const setJob = (
    id: string | null,
    status: JobStatus,
    error: ApiError | null = null,
  ) => {
    setJobId(id);
    setJobStatus(status);
    setJobError(error);
  };

  const [videoModel, setVideoModel] = useState<string | null>(null);
  const [serverNeedsKey, setServerNeedsKey] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data.video_model) setVideoModel(data.video_model);
        // Server tells us whether it has a default GOOGLE_API_KEY configured.
        // If not, the user MUST set one in Settings.
        if (typeof data.has_default_key === 'boolean') {
          setServerNeedsKey(!data.has_default_key);
        }
      })
      .catch(() => {
        /* health check is best-effort; ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- BYO API key -------------------------------------------------------
  const [apiKey, setApiKeyState] = useState('');
  const [apiKeyRestored, setApiKeyRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(API_KEY_STORAGE_KEY);
      if (raw) setApiKeyState(raw);
    } catch {
      /* ignore */
    } finally {
      setApiKeyRestored(true);
    }
  }, []);
  const setApiKey = (value: string) => {
    setApiKeyState(value);
    try {
      if (value) {
        window.localStorage.setItem(API_KEY_STORAGE_KEY, value);
      } else {
        window.localStorage.removeItem(API_KEY_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  };
  // Suppress unused-var warning; presence is intentional for future use
  // (e.g. showing a "loading…" state if we ever do async restore).
  void apiKeyRestored;

  const authHeaders = (): Record<string, string> => {
    const trimmed = apiKey.trim();
    return trimmed ? { 'X-Goog-Api-Key': trimmed } : {};
  };

  // ---- Export / Import / Reset (Prompts menu) ----------------------------
  const exportSnapshot = (): SavedState => ({
    version: 1,
    keywords,
    structuredPrompt,
    groundingInstruction,
  });

  const importSnapshot = (raw: unknown): boolean => {
    if (!isSavedState(raw)) return false;
    setKeywords({ ...EMPTY_KEYWORDS, ...(raw.keywords ?? {}) });
    setStructuredPrompt(raw.structuredPrompt ?? '');
    setGroundingInstruction(raw.groundingInstruction ?? '');
    // Importing a snapshot is a fresh start; clear any in-flight job state
    // and uploaded image so the user isn't confused.
    setImageFile(null);
    setJob(null, 'idle');
    setJobStartedAt(null);
    return true;
  };

  const resetWorkspace = () => {
    setKeywords(EMPTY_KEYWORDS);
    setStructuredPrompt('');
    setGroundingInstruction('');
    setImageFile(null);
    setJob(null, 'idle');
    setJobStartedAt(null);
  };

  return (
    <Ctx.Provider
      value={{
        keywords,
        setKeyword,
        structuredPrompt,
        setStructuredPrompt,
        groundingInstruction,
        setGroundingInstruction,
        imageFile,
        setImageFile,
        jobId,
        jobStatus,
        jobError,
        jobStartedAt,
        setJob,
        setJobStartedAt,
        videoModel,
        apiKey,
        setApiKey,
        serverNeedsKey,
        authHeaders,
        exportSnapshot,
        importSnapshot,
        resetWorkspace,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
