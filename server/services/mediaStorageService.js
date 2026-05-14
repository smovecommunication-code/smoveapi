const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function inferMediaType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'document';
}

function sanitizeFilename(filename = '') {
  const base = path.basename(filename).toLowerCase();
  return base.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'media-file';
}

class LocalDiskMediaStorage {
  constructor({ uploadRootDir, publicBasePath, maxUploadBytes, allowedMimeTypes }) {
    this.uploadRootDir = uploadRootDir;
    this.publicBasePath = publicBasePath;
    this.maxUploadBytes = maxUploadBytes;
    this.allowedMimeTypes = new Set(allowedMimeTypes);
  }

  ensureUploadDir(relativeDir) {
    const fullDir = path.join(this.uploadRootDir, relativeDir);
    if (!fs.existsSync(fullDir)) {
      fs.mkdirSync(fullDir, { recursive: true });
    }
    return fullDir;
  }

  saveBase64Upload({ filename, mimeType, encodedFile }) {
    if (!this.allowedMimeTypes.has(mimeType)) {
      return { ok: false, error: { code: 'MEDIA_UNSUPPORTED_TYPE', message: `Unsupported media type: ${mimeType}` } };
    }

    let buffer;
    try {
      buffer = Buffer.from(encodedFile, 'base64');
    } catch (_error) {
      return { ok: false, error: { code: 'MEDIA_INVALID_PAYLOAD', message: 'Unable to decode media payload.' } };
    }

    if (!buffer.length) {
      return { ok: false, error: { code: 'MEDIA_INVALID_PAYLOAD', message: 'Media payload is empty.' } };
    }

    if (buffer.length > this.maxUploadBytes) {
      return { ok: false, error: { code: 'MEDIA_TOO_LARGE', message: `Upload exceeds ${this.maxUploadBytes} bytes.` } };
    }

    const now = new Date();
    const yyyy = `${now.getUTCFullYear()}`;
    const mm = `${now.getUTCMonth() + 1}`.padStart(2, '0');
    const relativeDir = `${yyyy}/${mm}`;
    const dir = this.ensureUploadDir(relativeDir);

    const clean = sanitizeFilename(filename);
    const ext = path.extname(clean);
    const baseName = path.basename(clean, ext);
    const id = `media_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storedName = `${baseName}-${id}${ext}`;
    const fullPath = path.join(dir, storedName);

    fs.writeFileSync(fullPath, buffer);

    const relativePath = `${relativeDir}/${storedName}`.replace(/\\/g, '/');
    return {
      ok: true,
      file: {
        id,
        mediaType: inferMediaType(mimeType),
        mimeType,
        size: buffer.length,
        storagePath: fullPath,
        publicUrl: `${this.publicBasePath}/${relativePath}`,
        checksumSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      },
    };
  }
}

module.exports = { LocalDiskMediaStorage };
