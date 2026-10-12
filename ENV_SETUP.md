# Environment setup

Create a `.env.local` file in the project root with:

```bash
MONGODB_URI="YOUR_MONGODB_CONNECTION_STRING"
MONGODB_DB="acta"
NEXT_PUBLIC_PRIVY_APP_ID="YOUR_PRIVY_APP_ID"

# App route access gate:
# - "true" (default)  => /earn, /trade, /portfolio, /market/* are accessible
# - "false"           => those routes redirect to / (landing), but /api/whitelist still works
NEXT_PUBLIC_APP_ENABLED="true"

# Optional: vault HTTP API base; defaults to the host of NEXT_PUBLIC_RFQ_WS_URL
# NEXT_PUBLIC_API_URL="https://beta-api.acta.markets"

# Dev only: made-up sample vaults on /earn (ignored by production builds)
# NEXT_PUBLIC_VAULTS_SAMPLE="1"
```

Then run:

```bash
npm install
npm run dev
```


