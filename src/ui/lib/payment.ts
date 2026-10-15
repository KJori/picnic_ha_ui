/**
 * The bank's address that Picnic sends for paying. It is opened in a new tab
 * that starts out as this page's own blank tab, so only a plain https address,
 * or one on this page's own site (the way back from the bank), is opened: a
 * javascript: or data: address would run as this page.
 */
export function paymentAddress(value: unknown, pageOrigin: string): string | null {
  if (typeof value !== "string" || value.length > 4000) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === "https:" || url.origin === pageOrigin) return url.href;
    return null;
  } catch {
    return null;
  }
}
