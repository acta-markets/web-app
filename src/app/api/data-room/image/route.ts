import { getAccessToken } from "@/lib/data-room/auth";

/**
 * Server-side image proxy for inline images in Google Docs.
 *
 * Docs image content URIs live on googleusercontent.com and can be auth-gated,
 * so we fetch them here with the access token and stream the bytes back. Only
 * HTTPS googleusercontent / drive.google.com hosts are allowed; the token never
 * reaches the client.
 */

export const dynamic = "force-dynamic";

function allowedHost(hostname: string): boolean {
  return (
    hostname === "drive.google.com" ||
    hostname.endsWith(".googleusercontent.com")
  );
}

export async function GET(request: Request) {
  const src = new URL(request.url).searchParams.get("src");
  if (!src) return new Response("missing src", { status: 400 });

  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return new Response("invalid src", { status: 400 });
  }

  if (url.protocol !== "https:" || !allowedHost(url.hostname)) {
    return new Response("blocked host", { status: 403 });
  }

  const token = await getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url.toString(), { headers, cache: "no-store" });
  if (!response.ok) return new Response("not found", { status: 404 });

  const body = await response.arrayBuffer();
  const contentType =
    response.headers.get("content-type") ?? "application/octet-stream";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
