/**
 * Colours Picnic sends with its pages (an offer price in red, a label's own
 * background). Picnic chooses them for its white app; this page also has a
 * dark theme, so they go through here.
 */
import type { CSSProperties } from "react";

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION = /^(?:rgba?|hsla?)\(\s*[\d.]+%?(?:\s*[,\s]\s*[\d.]+%?){2}(?:\s*[,/]\s*[\d.]+%?)?\s*\)$/i;

/** Only a plain colour value gets through: no url(), no var(), nothing else. */
export function picnicColour(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const colour = value.trim();
  return HEX.test(colour) || FUNCTION.test(colour) ? colour : undefined;
}

/** sRGB 0..255 of a #hex or rgb() colour; null for anything else. */
function channels(colour: string): [number, number, number] | null {
  if (HEX.test(colour)) {
    let hex = colour.slice(1);
    if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/i.exec(colour);
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(colour: string): number | null {
  const rgb = channels(colour);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Black or white, whichever reads better on `background`. */
export function inkFor(background: string): string {
  const l = luminance(background);
  // Contrast with black is (l + .05) / .05, with white 1.05 / (l + .05); they are equal at l ≈ .179.
  return l === null || l > 0.179 ? "#111111" : "#ffffff";
}

/**
 * Text in a colour Picnic chose. The class lets the stylesheet lighten it on
 * the dark theme, where Picnic's dark red or navy would not be readable.
 */
export function picnicInk(colour: unknown): { className?: string; style?: CSSProperties } {
  const c = picnicColour(colour);
  return c ? { className: "picnic-ink", style: { "--picnic-ink": c } as CSSProperties } : {};
}

/**
 * A label in Picnic's own colours, shown the same in both themes. When Picnic
 * gives only a background, the text is black or white to suit it; with only a
 * text colour it is handled like other Picnic text.
 */
export function picnicLabel(text: unknown, background: unknown): { className?: string; style?: CSSProperties } {
  const fg = picnicColour(text);
  const bg = picnicColour(background);
  if (bg) return { style: { backgroundColor: bg, color: fg ?? inkFor(bg) } };
  return picnicInk(fg);
}
