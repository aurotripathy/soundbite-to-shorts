'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { ErrorBanner } from './error-banner';
import {
  errorFromException,
  parseApiError,
  type ApiError,
} from '@/lib/api-error';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { useWorkspace, type KeywordKey } from '@/lib/workspace-context';

type CameraAnglePreset = {
  value: string;
  label: string;
  description: string;
  bestFor: string;
};

const CAMERA_ANGLES: CameraAnglePreset[] = [
  {
    value: 'low angle push-in',
    label: 'Low Angle Push-In',
    description:
      'Shoot slightly below eye level and slowly move toward the subject. Creates authority, intensity, confidence.',
    bestFor: 'Introductions, product reveals, fitness, cars, tech.',
  },
  {
    value: 'over-the-shoulder (OTS)',
    label: 'Over-the-Shoulder (OTS)',
    description:
      'Frame from behind the subject looking at what they are doing. Makes viewers feel "inside the process".',
    bestFor: 'Cooking, coding, editing, sketching, texting scenes.',
  },
  {
    value: 'top-down overhead shot',
    label: 'Top-Down / Overhead Shot',
    description:
      'Camera directly above the subject or workspace. Extremely effective for tutorials and aesthetic B-roll.',
    bestFor: 'Desk setups, food, unboxing, notebooks.',
  },
  {
    value: 'side profile with motion',
    label: 'Side Profile with Motion',
    description:
      '45–90° side angle while the subject walks, talks, or works. Adds cinematic movement without expensive gear.',
    bestFor: 'Storytelling, documentary-style reels, interviews.',
  },
  {
    value: 'extreme close-up (detail shot)',
    label: 'Extreme Close-Up (Detail Shot)',
    description:
      'Tight framing on hands, eyes, keyboard, pouring coffee, button clicks, etc. Creates texture and pacing.',
    bestFor: 'Essential for keeping retention high in short-form content.',
  },
];

const STYLE_PRESETS: CameraAnglePreset[] = [
  {
    value: 'cinematic realism',
    label: 'Cinematic Realism',
    description:
      'Film-quality visuals with realistic subjects, dramatic lighting, intentional camera movement, and polished Hollywood-style production values.',
    bestFor: 'Ads, trailers, brand videos.',
  },
  {
    value: 'UGC (authentic handheld user-generated content)',
    label: 'UGC',
    description:
      'Casual, authentic-looking content that feels self-recorded on a smartphone by a real person.',
    bestFor: 'TikTok, Instagram, influencer content.',
  },
  {
    value: 'documentary',
    label: 'Documentary',
    description:
      'Informative, observational storytelling that presents people, events, or subjects with a factual and realistic perspective.',
    bestFor: 'Educational, storytelling, news.',
  },
  {
    value: 'anime / manga',
    label: 'Anime/Manga',
    description:
      'Stylized illustrated visuals inspired by Japanese animation and comics, emphasizing expressive characters and dramatic storytelling.',
    bestFor: 'Entertainment, gaming, stylized marketing.',
  },
];

const CAMERA_MOVEMENTS: CameraAnglePreset[] = [
  {
    value: 'push-in (zoom or physical move forward)',
    label: 'Push-In (Zoom or Physical Move Forward)',
    description:
      'Camera moves toward the subject. Builds intensity and focus.',
    bestFor: 'Hooks, emotional moments, reveals.',
  },
  {
    value: 'pull-out',
    label: 'Pull-Out',
    description:
      'Camera moves away from the subject. Creates reflection, scale, or "ending scene" feeling.',
    bestFor: 'Transitions or dramatic exits.',
  },
  {
    value: 'pan',
    label: 'Pan',
    description:
      'Camera rotates left or right from a fixed point. Reveals environment or follows motion.',
    bestFor: 'Showing setups, landscapes, crowds.',
  },
  {
    value: 'tracking / follow shot',
    label: 'Tracking / Follow Shot',
    description:
      'Camera physically follows the subject while moving. Feels immersive and modern.',
    bestFor: 'Reels, travel, gym, lifestyle content.',
  },
  {
    value: 'tilt',
    label: 'Tilt',
    description:
      'Camera angles vertically up or down. Upward tilt = reveal / build suspense. Downward tilt = scale, detail, vulnerability.',
    bestFor: 'Reveals, intimate detail shots, dramatic beats.',
  },
];

const NONE_VALUE = '__none__';

const KEYWORD_TO_API: Record<KeywordKey, string> = {
  subject: 'subject',
  action: 'action',
  scene: 'scene',
  style: 'style',
  cameraAngle: 'camera_angle',
  cameraMovement: 'camera_movement',
  soundEffects: 'sound_effects',
  dialogue: 'dialogue',
};

export function BasicPrompt() {
  const { keywords, setKeyword, setStructuredPrompt, authHeaders } =
    useWorkspace();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const anyFilled = Object.values(keywords).some((v) => v.trim());

  const handleSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      (Object.keys(keywords) as KeywordKey[]).forEach((k) => {
        payload[KEYWORD_TO_API[k]] = keywords[k];
      });

      const res = await fetch('/api/structured-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        setError(await parseApiError(res));
        return;
      }

      const data = (await res.json()) as { prompt: string };
      setStructuredPrompt(data.prompt);
    } catch (e) {
      setError(errorFromException(e, 'Failed to expand prompt.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">2. Set Soundbite and Scene</h2>
        <p className="text-sm text-muted-foreground">
          Write your soundbite and describe the scene piece by piece. Gemini
          weaves these into a single cinematic Veo prompt.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="dialogue"
          className="text-sm font-medium text-foreground"
        >
          Soundbite
        </label>
        <Textarea
          id="dialogue"
          value={keywords.dialogue}
          onChange={(e) => setKeyword('dialogue', e.target.value)}
          placeholder='"When you square a side length, you are calculating the area of a square built off that side."'
          className="min-h-24 resize-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Subject"
          value={keywords.subject}
          onChange={(v) => setKeyword('subject', v)}
          placeholder="a professor"
        />
        <Field
          label="Action"
          value={keywords.action}
          onChange={(v) => setKeyword('action', v)}
          placeholder="giving a lecture on the Pythagorean theorem"
        />
        <Field
          label="Scene"
          value={keywords.scene}
          onChange={(v) => setKeyword('scene', v)}
          placeholder="in a classroom, presenting in front of students"
        />
        <PresetSelectField
          label="Style"
          helpTitle="4 video styles"
          helpSubtitle="Pick the overall look and feel Gemini should bake into the prompt."
          presets={STYLE_PRESETS}
          value={keywords.style}
          onChange={(v) => setKeyword('style', v)}
          placeholder="Choose a style…"
        />
        <PresetSelectField
          label="Camera angle"
          helpTitle="5 versatile camera angles"
          helpSubtitle="Make short-form videos feel dynamic instead of “talking head + jump cuts”."
          presets={CAMERA_ANGLES}
          value={keywords.cameraAngle}
          onChange={(v) => setKeyword('cameraAngle', v)}
          placeholder="Choose a camera angle…"
        />
        <PresetSelectField
          label="Camera movement"
          helpTitle="5 camera movements that add motion"
          helpSubtitle="Pair these with an angle to make scenes feel produced rather than static."
          presets={CAMERA_MOVEMENTS}
          value={keywords.cameraMovement}
          onChange={(v) => setKeyword('cameraMovement', v)}
          placeholder="Choose a camera movement…"
        />
      </div>

      <Field
        label="Sound effects"
        value={keywords.soundEffects}
        onChange={(v) => setKeyword('soundEffects', v)}
        placeholder="clicking of computer keys"
      />

      <ErrorBanner error={error} />

      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          disabled={loading || !anyFilled}
          className="px-6"
        >
          {loading ? 'Generating…' : 'Gen Structured Prompt'}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function PresetSelectField({
  label,
  helpTitle,
  helpSubtitle,
  presets,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  helpTitle: string;
  helpSubtitle: string;
  presets: CameraAnglePreset[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const selectValue =
    value && presets.some((c) => c.value === value) ? value : NONE_VALUE;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${label} guide`}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            side="bottom"
            className="w-96 max-h-[28rem] overflow-y-auto p-4"
          >
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {helpTitle}
                </p>
                <p className="text-xs text-muted-foreground">{helpSubtitle}</p>
              </div>
              <ul className="flex flex-col gap-3">
                {presets.map((c) => (
                  <li key={c.value} className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-foreground">
                      {c.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">
                        Best for:{' '}
                      </span>
                      {c.bestFor}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <Select
        value={selectValue}
        onValueChange={(v) => onChange(v === NONE_VALUE ? '' : v)}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>None</SelectItem>
          {presets.map((c) => (
            <SelectItem key={c.value} value={c.value}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
