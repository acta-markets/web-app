/** What a browser can do with a finished card. Each one is asked for, never assumed. */

export function shareFile(blob: Blob, filename: string): File {
  return new File([blob], `${filename}.png`, { type: "image/png" });
}

/** True where an image can be put on the clipboard (not Firefox before 127, not an insecure page). */
export function canCopyImage(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.write === "function" && typeof ClipboardItem !== "undefined";
}

export async function copyImage(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

/** True where the system share sheet takes a file, which is how a phone attaches the image to a post. */
export function canShareFile(file: File): boolean {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Opens the system share sheet. Resolves false when the user closed it without sharing. */
export async function shareNative(file: File, text: string, url: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], text: `${text} ${url}` });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return false;
    throw err;
  }
}

export function downloadImage(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${filename}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // the download reads the URL after the click returns
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** A new post on X with the words and the link filled in. X takes no image this way: it is pasted or attached. */
export function xPostUrl(text: string, url: string): string {
  const params = new URLSearchParams({ text, url });
  return `https://x.com/intent/post?${params.toString()}`;
}

/** The link a post carries: the site, with the sharer's referral code when they have one. */
export function shareLink(origin: string, referralCode?: string | null): string {
  return referralCode ? `${origin}/?ref=${encodeURIComponent(referralCode)}` : origin;
}
