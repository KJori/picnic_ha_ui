/**
 * Reading a pasted shopping list.
 */

/** "2 havermelk", "3x tomatenblokjes", "havermelk" → amount and words. */
export function parseListLine(line: string): { count: number; query: string } | null {
  const text = line.replace(/^[\s\-*•·]+/, "").trim();
  if (!text) return null;
  const match = /^(\d{1,2})\s*[x×]?\s+(.+)$/i.exec(text);
  if (match && Number(match[1]) > 0) return { count: Math.min(99, Number(match[1])), query: match[2].trim() };
  return { count: 1, query: text };
}
