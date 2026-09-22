# SAHAYAM Frontend

Vite + React + TypeScript frontend for the SAHAYAM disaster-relief coordination platform.

## Setup

```bash
cp .env.example .env
# edit .env if needed
npm install
npm run dev
```

App: http://localhost:5173  
API default: http://localhost:8000

## Demo admin credentials

See `.env.example`:

- `VITE_ADMIN_EMAIL`
- `VITE_ADMIN_PASSWORD`

Citizen and volunteer profiles are stored in the browser (localStorage). Admin session uses sessionStorage.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run preview` — preview production build
