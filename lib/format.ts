/**
 * Tiny display helpers for model slugs and elapsed durations.
 */

/**
 * Turn a raw model id from the API into a friendly badge string.
 *
 *   veo-3.1-fast-generate-preview    -> "Veo 3.1 Fast"
 *   veo-3.0-generate-001             -> "Veo 3.0"
 *   veo-2.0-generate-001             -> "Veo 2.0"
 *   gemini-2.5-flash                 -> "Gemini 2.5 Flash"
 *   gemini-3.1-flash-image-preview   -> "Gemini 3.1 Flash Image"
 *   imagen-4.0-fast-generate-001     -> "Imagen 4.0 Fast"
 *
 * Falls back to the raw slug when nothing matches.
 */
export function formatModelName(slug: string | null | undefined): string {
  if (!slug) return '';

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const veo = slug.match(
    /^veo-(\d+(?:\.\d+)?)(?:-(fast|lite|pro|ultra))?(?:-generate)?/,
  );
  if (veo) {
    const tier = veo[2] ? ` ${cap(veo[2])}` : '';
    return `Veo ${veo[1]}${tier}`;
  }

  const gemini = slug.match(
    /^gemini-(\d+(?:\.\d+)?)(?:-(flash|pro))?(?:-(image))?/,
  );
  if (gemini) {
    const parts = ['Gemini', gemini[1]];
    if (gemini[2]) parts.push(cap(gemini[2]));
    if (gemini[3]) parts.push('Image');
    return parts.join(' ');
  }

  const imagen = slug.match(/^imagen-(\d+(?:\.\d+)?)(?:-(fast|ultra))?/);
  if (imagen) {
    const tier = imagen[2] ? ` ${cap(imagen[2])}` : '';
    return `Imagen ${imagen[1]}${tier}`;
  }

  return slug;
}

/** ms -> "m:ss" (minimum "0:00"). */
export function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
