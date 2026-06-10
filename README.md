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

## Cloudinary media storage

Production media uploads use Cloudinary as the source of truth. Configure the API service with:

```env
MEDIA_STORAGE_DRIVER=cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_UPLOAD_FOLDER=smove
```

The API uploads binaries directly to Cloudinary and stores the returned secure URL, public ID, asset ID, dimensions, resource type, and editorial metadata in the MongoDB-backed content state. CMS and public-site consumers resolve the stored secure URL through the shared media contract. Deletion remains reference-protected; once unused, deleting an asset destroys it in Cloudinary and removes its MongoDB media record. Existing `/uploads` URLs remain resolvable only as legacy compatibility paths and are not used for new production uploads.
