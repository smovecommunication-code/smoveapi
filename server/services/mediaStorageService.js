const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function inferMediaType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function cloudinaryResourceType(mimeType = '') {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return 'raw';
}

function sanitizeFilename(filename = '') {
  const base = path.basename(filename).toLowerCase();
  return base.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'media-file';
}

function validateUpload({ mimeType, encodedFile, maxUploadBytes, allowedMimeTypes }) {
  if (!new Set(allowedMimeTypes).has(mimeType)) {
    return { ok: false, error: { code: 'MEDIA_UNSUPPORTED_TYPE', message: `Unsupported media type: ${mimeType}` } };
  }
  let buffer;
  try {
    buffer = Buffer.from(encodedFile, 'base64');
  } catch (_error) {
    return { ok: false, error: { code: 'MEDIA_INVALID_PAYLOAD', message: 'Unable to decode media payload.' } };
  }
  if (!buffer.length) return { ok: false, error: { code: 'MEDIA_INVALID_PAYLOAD', message: 'Media payload is empty.' } };
  if (buffer.length > maxUploadBytes) {
    return { ok: false, error: { code: 'MEDIA_TOO_LARGE', message: `Upload exceeds ${maxUploadBytes} bytes.` } };
  }
  return { ok: true, buffer };
}

class LocalDiskMediaStorage {
  constructor({ uploadRootDir, publicBasePath, maxUploadBytes, allowedMimeTypes }) {
    this.driver = 'local-disk';
    this.uploadRootDir = uploadRootDir;
    this.publicBasePath = publicBasePath;
    this.maxUploadBytes = maxUploadBytes;
    this.allowedMimeTypes = allowedMimeTypes;
  }

  ensureUploadDir(relativeDir) {
    const fullDir = path.join(this.uploadRootDir, relativeDir);
    if (!fs.existsSync(fullDir)) fs.mkdirSync(fullDir, { recursive: true });
    return fullDir;
  }

  async saveBase64Upload({ filename, mimeType, encodedFile }) {
    const validated = validateUpload({ mimeType, encodedFile, maxUploadBytes: this.maxUploadBytes, allowedMimeTypes: this.allowedMimeTypes });
    if (!validated.ok) return validated;
    const { buffer } = validated;
    const now = new Date();
    const relativeDir = `${now.getUTCFullYear()}/${`${now.getUTCMonth() + 1}`.padStart(2, '0')}`;
    const dir = this.ensureUploadDir(relativeDir);
    const clean = sanitizeFilename(filename);
    const ext = path.extname(clean);
    const baseName = path.basename(clean, ext);
    const id = `media_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const storedName = `${baseName}-${id}${ext}`;
    const fullPath = path.join(dir, storedName);
    fs.writeFileSync(fullPath, buffer);
    const relativePath = `${relativeDir}/${storedName}`.replace(/\\/g, '/');
    return { ok: true, file: { id, mediaType: inferMediaType(mimeType), mimeType, size: buffer.length, storagePath: fullPath, filename: relativePath, publicPath: `${this.publicBasePath}/${relativePath}`, publicUrl: `${this.publicBasePath}/${relativePath}`, checksumSha256: crypto.createHash('sha256').update(buffer).digest('hex'), storageDriver: this.driver } };
  }

  async deleteFile(mediaFile) {
    const storagePath = `${mediaFile?.path || mediaFile?.storagePath || ''}`.trim();
    if (storagePath && fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    return { ok: true };
  }
}

class CloudinaryMediaStorage {
  constructor({ cloudName, apiKey, apiSecret, uploadFolder, maxUploadBytes, allowedMimeTypes, fetchImpl = fetch }) {
    this.driver = 'cloudinary';
    this.cloudName = cloudName;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.uploadFolder = `${uploadFolder || 'smove'}`.replace(/^\/+|\/+$/g, '');
    this.maxUploadBytes = maxUploadBytes;
    this.allowedMimeTypes = allowedMimeTypes;
    this.fetch = fetchImpl;
  }

  signature(params) {
    const payload = Object.entries(params).filter(([, value]) => value !== undefined && value !== '').sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('&');
    return crypto.createHash('sha1').update(`${payload}${this.apiSecret}`).digest('hex');
  }

  async request(resourceType, action, params, file) {
    const timestamp = Math.floor(Date.now() / 1000);
    const signedParams = { ...params, timestamp };
    const form = new FormData();
    Object.entries(signedParams).forEach(([key, value]) => form.append(key, `${value}`));
    form.append('api_key', this.apiKey);
    form.append('signature', this.signature(signedParams));
    if (file) form.append('file', file);
    const response = await this.fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/${action}`, { method: 'POST', body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.error) throw new Error(body.error?.message || `Cloudinary ${action} failed (${response.status}).`);
    return body;
  }

  async saveBase64Upload({ filename, mimeType, encodedFile, title, alt, caption, tags = [] }) {
    const validated = validateUpload({ mimeType, encodedFile, maxUploadBytes: this.maxUploadBytes, allowedMimeTypes: this.allowedMimeTypes });
    if (!validated.ok) return validated;
    const resourceType = cloudinaryResourceType(mimeType);
    try {
      const result = await this.request(resourceType, 'upload', {
        folder: this.uploadFolder,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        tags: tags.join(','),
      }, `data:${mimeType};base64,${encodedFile}`);
      return { ok: true, file: {
        id: `media_${result.asset_id || crypto.randomUUID()}`,
        mediaType: inferMediaType(mimeType), mimeType, size: result.bytes || validated.buffer.length,
        filename: filename || result.original_filename, publicPath: result.secure_url, publicUrl: result.secure_url,
        storageDriver: this.driver, publicId: result.public_id, assetId: result.asset_id, resourceType: result.resource_type,
        format: result.format, version: result.version, width: result.width, height: result.height,
        checksumSha256: crypto.createHash('sha256').update(validated.buffer).digest('hex'),
      } };
    } catch (error) {
      return { ok: false, error: { code: 'MEDIA_STORAGE_ERROR', message: `Cloudinary upload failed: ${error.message}` } };
    }
  }

  async deleteFile(mediaFile) {
    const publicId = `${mediaFile?.publicId || mediaFile?.metadata?.publicId || ''}`.trim();
    if (!publicId) return { ok: false, error: { code: 'MEDIA_STORAGE_ID_MISSING', message: 'Cloudinary public ID is missing.' } };
    try {
      const result = await this.request(mediaFile.resourceType || mediaFile.metadata?.resourceType || 'image', 'destroy', { public_id: publicId, invalidate: true });
      if (!['ok', 'not found'].includes(result.result)) throw new Error(`Unexpected destroy result: ${result.result}`);
      return { ok: true, result: result.result };
    } catch (error) {
      return { ok: false, error: { code: 'MEDIA_STORAGE_ERROR', message: `Cloudinary delete failed: ${error.message}` } };
    }
  }
}

function createMediaStorage(config) {
  if (config.driver === 'cloudinary') return new CloudinaryMediaStorage(config);
  return new LocalDiskMediaStorage(config);
}

module.exports = { LocalDiskMediaStorage, CloudinaryMediaStorage, createMediaStorage, inferMediaType, cloudinaryResourceType };
