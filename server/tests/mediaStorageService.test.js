const test = require('node:test');
const assert = require('node:assert/strict');
const { CloudinaryMediaStorage, createMediaStorage } = require('../services/mediaStorageService');

const config = {
  driver: 'cloudinary', cloudName: 'demo', apiKey: 'key', apiSecret: 'secret', uploadFolder: 'smove',
  maxUploadBytes: 1024, allowedMimeTypes: ['image/png'],
};

test('createMediaStorage selects Cloudinary as the configured media source of truth', () => {
  assert.ok(createMediaStorage({ ...config, fetchImpl: async () => ({}) }) instanceof CloudinaryMediaStorage);
});

test('Cloudinary upload returns canonical Cloudinary metadata', async () => {
  let request;
  const storage = new CloudinaryMediaStorage({ ...config, fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ asset_id: 'asset-1', public_id: 'smove/photo_abc', resource_type: 'image', secure_url: 'https://res.cloudinary.com/demo/image/upload/v1/smove/photo_abc.png', bytes: 4, format: 'png', version: 1, width: 100, height: 50 }) };
  } });
  const result = await storage.saveBase64Upload({ filename: 'photo.png', mimeType: 'image/png', encodedFile: Buffer.from('test').toString('base64'), alt: 'Photo' });
  assert.equal(result.ok, true);
  assert.equal(result.file.publicUrl, 'https://res.cloudinary.com/demo/image/upload/v1/smove/photo_abc.png');
  assert.equal(result.file.publicId, 'smove/photo_abc');
  assert.equal(result.file.storageDriver, 'cloudinary');
  assert.match(request.url, /\/image\/upload$/);
  assert.equal(request.options.method, 'POST');
});

test('Cloudinary delete destroys the stored public ID', async () => {
  let requestUrl = '';
  const storage = new CloudinaryMediaStorage({ ...config, fetchImpl: async (url) => {
    requestUrl = url;
    return { ok: true, json: async () => ({ result: 'ok' }) };
  } });
  const result = await storage.deleteFile({ publicId: 'smove/photo_abc', resourceType: 'image' });
  assert.equal(result.ok, true);
  assert.match(requestUrl, /\/image\/destroy$/);
});
