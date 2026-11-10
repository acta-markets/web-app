# Acta Data Room

A read-only, internal data room built on top of Google Drive. It lists a Drive
folder as a tree in the sidebar and renders Google Docs as clean, brand-styled
HTML (Space Grotesk headings, JetBrains Mono body, Acta accent colours, no
rounded corners, no Google chrome). Google Drive is the "database"; documents
are the records.

Routes:

- `/data-room` — the room index (sidebar tree + "select a document" state)
- `/data-room/doc/[fileId]` — a single document, rendered from the Docs API

Everything is server-side. The Google access token never reaches the client, and
only read-only scopes are used.

---

## Which Google APIs are used

| API | Endpoint | Purpose |
|---|---|---|
| Drive v3 | `GET /drive/v3/files` | List files and folders (paginated), filter by parent + trashed |
| Drive v3 | `GET /drive/v3/files/{id}` | File metadata (name, mimeType, modifiedTime, webViewLink) |
| Docs v1 | `GET /docs/v1/documents/{id}` | Fetch the document's structured JSON |

**Why Docs JSON instead of Drive export→HTML.** Drive's HTML export is simpler to
fetch but bloated with inline `style` attributes and a `<style>` block, and it
encodes bold/italic in `<span>` styles rather than `<strong>`/`<em>`. Parsing the
Docs JSON (`docs/v1`) and emitting our own semantic HTML gives brand-correct output
with **no sanitizer dependency** — every tag is whitelisted and every text node is
escaped, so the HTML is safe to inject by construction. Non-Docs files (PDFs,
Sheets, Slides, images) are shown as metadata with an "Open in Drive" link, not
rendered inline.

Scopes used (read-only only):

```
https://www.googleapis.com/auth/drive.readonly
https://www.googleapis.com/auth/documents.readonly
```

---

## Auth model

**Recommended: a service account shared into the target folder.** It avoids
per-user OAuth entirely, has no consent flow, and is scoped to exactly the folders
you share with it.

The app also supports the existing OAuth app (tim@acta.markets) via a refresh
token, as a fallback if you'd rather not mint a service account.

Precedence when both are present: service account wins.

---

## What Tim must do (5 steps)

1. **Enable the APIs.** In [Google Cloud Console](https://console.cloud.google.com),
   pick the project that owns the Drive folder, then enable **Google Drive API**
   and **Google Docs API** (both read-only usage).

2. **Create a service account.** IAM & Admin → Service Accounts → Create. Give it
   a name like `acta-data-room`. Skip role grants (it doesn't need any on the
   project). Under "Keys" → Add key → JSON, download the key file.

3. **Share the Drive folder** with the service account's email address (it looks
   like `acta-data-room@<project>.iam.gserviceaccount.com`). Share with **Viewer**
   permission. Everything inside inherits it.

4. **Put credentials in `.env.local`.** Either point at the downloaded JSON file:
   ```bash
   GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/to/service-account.json"
   ```
   or inline the two fields:
   ```bash
   GOOGLE_SA_CLIENT_EMAIL="acta-data-room@<project>.iam.gserviceaccount.com"
   GOOGLE_SA_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```
   (Keep the `\n` as literal backslash-n in the env file.)

5. **Point it at a folder** and run:
   ```bash
   DATA_ROOM_FOLDER_ID="<folder id from the Drive URL>"
   npm run dev
   ```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DATA_ROOM_FOLDER_ID` | yes | Root Drive folder id (the `folders/...` segment of its URL). |
| `DATA_ROOM_TITLE` | no | Sidebar heading; defaults to `Data Room`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | one of | Absolute path to the service-account JSON key file. |
| `GOOGLE_SA_CLIENT_EMAIL` | one of | Service account email (used with `GOOGLE_SA_PRIVATE_KEY`). |
| `GOOGLE_SA_PRIVATE_KEY` | one of | Service account PEM private key. |
| `GOOGLE_OAUTH_CLIENT_ID` | fallback | OAuth app client id (refresh-token path). |
| `GOOGLE_OAUTH_CLIENT_SECRET` | fallback | OAuth app client secret. |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | fallback | OAuth refresh token with drive.readonly scope. |

None of these are `NEXT_PUBLIC_*`; they never ship to the browser.

### Pointing it at any folder

Change `DATA_ROOM_FOLDER_ID` to another folder id. The tree, breadcrumbs, and
search all follow it automatically. Share that folder with the service account
(Viewer) the same way. To show several disconnected folders, share each into one
umbrella folder and point the room at that umbrella.

---

## Security notes

- Read-only scopes only; no `drive` write scope, no Docs write scope.
- The access token is cached server-side and never exposed to the client.
- Inline images are proxied through `/api/data-room/image`, which only fetches
  `https` googleusercontent / drive.google.com hosts with the server-side token.
- Document HTML is emitted from a whitelist (no user/Drive HTML is ever passed
  through unsanitized).
- Intended for internal use. If you deploy it anywhere, gate the `/data-room`
  path behind your existing auth or an IP allowlist; nothing here enforces access.

---

## Demo mode

With no `DATA_ROOM_FOLDER_ID` and no credentials, the room renders a sample tree
and sample documents so the layout and states can be inspected without Google
access. A banner explains that Drive is not configured.

## Verify

```bash
npx tsc --noEmit
npm run build
```

A build overwrites `.next/`, so don't run it against a live `next dev` server (see
`STYLE.md`).
