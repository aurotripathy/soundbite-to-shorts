'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useWorkspace } from '@/lib/workspace-context';

export function StructuredPrompt() {
  const { structuredPrompt, setStructuredPrompt } = useWorkspace();

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-foreground">Structured Prompt</CardTitle>
        <CardDescription>
          Review and edit before generating the video.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <textarea
          value={structuredPrompt}
          onChange={(e) => setStructuredPrompt(e.target.value)}
          placeholder="Structured prompt output will appear here…"
          className="min-h-48 w-full rounded-md border border-input bg-input px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </CardContent>
    </Card>
  );
}
