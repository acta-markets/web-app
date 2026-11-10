import "server-only";

import { readFileSync } from "node:fs";
import { SignJWT, importPKCS8 } from "jose";
import type { DataRoomConfig } from "./types";

/**
 * Google auth for the data room.
 *
 * Two supported credential models, both read-only:
 *  1. Service account (recommended) — shared into the target Drive folder.
 *  2. OAuth refresh token — the existing tim@acta.markets OAuth app.
 *
 * Scopes are read-only only: drive.readonly + documents.readonly.
 * The access token never leaves the server.
 */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
].join(" ");

interface ServiceAccount {
  clientEmail: string;
  privateKey: string;
}

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

function normalizePrivateKey(raw: string): string {
  // `.env` files store the PEM with literal \n; a JSON key file has real newlines.
  return raw.replace(/\\n/g, "\n");
}

function serviceAccountFromEnv(): ServiceAccount | null {
  const clientEmail = env("GOOGLE_SA_CLIENT_EMAIL");
  const privateKey = env("GOOGLE_SA_PRIVATE_KEY");
  if (!clientEmail || !privateKey) return null;
  return { clientEmail, privateKey: normalizePrivateKey(privateKey) };
}

function serviceAccountFromFile(): ServiceAccount | null {
  const credentialsPath = env("GOOGLE_APPLICATION_CREDENTIALS");
  if (!credentialsPath) return null;
  try {
    const parsed = JSON.parse(readFileSync(credentialsPath, "utf8")) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) return null;
    return {
      clientEmail: parsed.client_email,
      privateKey: normalizePrivateKey(parsed.private_key),
    };
  } catch {
    return null;
  }
}

/** Resolve the data room runtime config from env vars. No secrets are read into client code. */
export function getDataRoomConfig(): DataRoomConfig {
  const folderId = env("DATA_ROOM_FOLDER_ID") || null;
  const title = env("DATA_ROOM_TITLE") || "Data Room";

  const serviceAccount = serviceAccountFromEnv() ?? serviceAccountFromFile();
  const oauthClientId = env("GOOGLE_OAUTH_CLIENT_ID");
  const oauthClientSecret = env("GOOGLE_OAUTH_CLIENT_SECRET");
  const oauthRefreshToken = env("GOOGLE_OAUTH_REFRESH_TOKEN");

  const hasCredentials = Boolean(
    serviceAccount ||
      (oauthClientId && oauthClientSecret && oauthRefreshToken),
  );

  return {
    configured: Boolean(folderId && hasCredentials),
    demo: !folderId || !hasCredentials,
    folderId,
    title,
    error: null,
  };
}

let cached: { token: string; expiresAt: number } | null = null;

async function tokenRequest(body: Record<string, string>): Promise<{
  access_token: string;
  expires_in?: number;
}> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Google token request failed (${response.status})`);
  }
  return (await response.json()) as { access_token: string; expires_in?: number };
}

async function tokenViaServiceAccount(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(account.clientEmail)
    .setSubject(account.clientEmail)
    .setAudience(TOKEN_URL)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(account.privateKey, "RS256"));

  return tokenRequest({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
}

async function tokenViaRefreshToken() {
  return tokenRequest({
    grant_type: "refresh_token",
    client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: env("GOOGLE_OAUTH_REFRESH_TOKEN"),
  });
}

/** Return a valid access token, or null when the data room is not configured. */
export async function getAccessToken(): Promise<string | null> {
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const config = getDataRoomConfig();
  if (!config.configured) return null;

  const serviceAccount = serviceAccountFromEnv() ?? serviceAccountFromFile();

  const { access_token, expires_in } = serviceAccount
    ? await tokenViaServiceAccount(serviceAccount)
    : await tokenViaRefreshToken();

  const expiresIn = expires_in ?? 3600;
  cached = { token: access_token, expiresAt: Date.now() + (expiresIn - 120) * 1000 };
  return access_token;
}
