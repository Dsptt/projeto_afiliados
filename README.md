# IhuOfertas - Affiliate Link Management Hub

Serverless affiliate automation: Amazon PA-API → Firestore → Sharp.js creatives → ntfy.sh notifications → manual posting → Firebase Hosting tracking.

## Quick Start

```bash
# Install dependencies
cd functions && npm install

# Build TypeScript
npm run build

# Deploy
firebase deploy
```

## Project Structure

```
├── frontend/           # Static hosting files
│   ├── r/index.html   # Redirect page (tracks clicks)
│   ├── index.html     # Landing page
│   └── 404.html       # Error page
├── functions/          # Cloud Functions
│   └── src/index.ts   # trackClick, getProduct
├── firebase.json       # Firebase config
├── firestore.rules     # Security rules
└── storage.rules       # Storage rules
```

## Environment Variables

Copy `.env.example` to `.env` and fill in your credentials.

## Redirect URLs

Format: `https://ihuofertas.com.br/r/?id={productId}&utm_source={groupName}`

## Domain

- **Production:** ihuofertas.com.br
- **Firebase Project:** ihuofertas-hub
