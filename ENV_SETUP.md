# Environment setup

Create a `.env.local` file in the project root with:

```bash
MONGODB_URI="YOUR_MONGODB_CONNECTION_STRING"
MONGODB_DB="acta"
NEXT_PUBLIC_PRIVY_APP_ID="YOUR_PRIVY_APP_ID"

# App route access gate:
# - "true" (default)  => /earn, /portfolio, /market/* are accessible
# - "false"           => those routes redirect to / (landing), but /api/whitelist still works
NEXT_PUBLIC_APP_ENABLED="true"
```

Then run:

```bash
npm install
npm run dev
```


