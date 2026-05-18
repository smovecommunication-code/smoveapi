# api

Backend API application.

## Production endpoints
- API origin: `https://smoveapi-1.onrender.com`
- API base path used by frontends: `https://smoveapi-1.onrender.com/api/v1`

## Required CORS setup
Set `FRONTEND_ORIGINS` to explicit origins:
- `https://smove-three.vercel.app`
- `https://smoovecms.vercel.app`

Optional preview support is disabled by default:
- `ALLOW_CMS_VERCEL_PREVIEW_ORIGINS=false`

If enabled (`true`), only `https://smoovecms-*.vercel.app` is accepted (not all `*.vercel.app`).

Local development origins are always allowed:
- `http://localhost:5173`, `http://localhost:5174`
- `http://127.0.0.1:5173`, `http://127.0.0.1:5174`

## Commands
- `npm install`
- `npm run dev`
- `npm start`
