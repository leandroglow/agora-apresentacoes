import { getGoogleDriveAccessToken } from './google.mjs';

const ID_RE = /^[A-Za-z0-9_-]{10,}$/;
const MAX_BYTES = 3 * 1024 * 1024;

export class InventoryStoreError extends Error {
  constructor(code, status = 503) { super(code); this.code = code; this.status = status; }
}

/** Drive v2 metadata supplies the ETag used for conditional media updates. */
export class DriveInventoryStore {
  constructor({ fileId = process.env.INVENTORY_DATA_FILE_ID, tokenProvider = getGoogleDriveAccessToken, fetchImpl = fetch } = {}) {
    this.fileId = String(fileId || '').trim();
    this.tokenProvider = tokenProvider;
    this.fetch = fetchImpl;
    if (!ID_RE.test(this.fileId)) throw new InventoryStoreError('INVENTORY_DATA_CONFIG');
  }

  async get() {
    const token = await this.tokenProvider();
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = await this.metadata(token);
      if (!before.etag) throw new InventoryStoreError('INVENTORY_ETAG_UNAVAILABLE');
      if (before.size > MAX_BYTES) throw new InventoryStoreError('INVENTORY_DATA_TOO_LARGE', 413);
      const response = await this.fetch(`https://www.googleapis.com/drive/v3/files/${this.fileId}?alt=media&supportsAllDrives=true`, {
        headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000)
      });
      if (!response.ok) throw new InventoryStoreError(response.status === 404 ? 'INVENTORY_DATA_NOT_FOUND' : 'INVENTORY_DATA_UNAVAILABLE');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_BYTES) throw new InventoryStoreError('INVENTORY_DATA_TOO_LARGE', 413);
      let envelope;
      try { envelope = JSON.parse(bytes.toString('utf8')); }
      catch { throw new InventoryStoreError('INVENTORY_DATA_INVALID'); }
      const after = await this.metadata(token);
      if (!after.etag) throw new InventoryStoreError('INVENTORY_ETAG_UNAVAILABLE');
      if (after.size > MAX_BYTES) throw new InventoryStoreError('INVENTORY_DATA_TOO_LARGE', 413);
      if (before.etag === after.etag) return { envelope, etag: after.etag };
    }
    throw new InventoryStoreError('INVENTORY_READ_CONFLICT', 409);
  }

  async metadata(token) {
    const response = await this.fetch(`https://www.googleapis.com/drive/v2/files/${this.fileId}?fields=etag%2Cversion%2CfileSize&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000)
    });
    if (!response.ok) throw new InventoryStoreError(response.status === 404 ? 'INVENTORY_DATA_NOT_FOUND' : 'INVENTORY_DATA_UNAVAILABLE');
    const metadata = await response.json().catch(() => ({}));
    const etag = typeof metadata.etag === 'string' ? metadata.etag : response.headers.get('etag');
    return { etag, version: metadata.version, size: Number(metadata.fileSize || 0) };
  }

  async put(envelope, etag) {
    const body = Buffer.from(JSON.stringify(envelope));
    if (body.length > MAX_BYTES) throw new InventoryStoreError('INVENTORY_DATA_TOO_LARGE', 413);
    if (typeof etag !== 'string' || !etag) throw new InventoryStoreError('INVENTORY_ETAG_REQUIRED', 409);
    const token = await this.tokenProvider();
    const response = await this.fetch(`https://www.googleapis.com/upload/drive/v2/files/${this.fileId}?uploadType=media&supportsAllDrives=true`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8', 'If-Match': etag },
      body, signal: AbortSignal.timeout(25000)
    });
    if (response.status === 412) return { conflict: true };
    if (!response.ok) throw new InventoryStoreError('INVENTORY_DATA_UNAVAILABLE');
    const payload = await response.json().catch(() => ({}));
    const nextEtag = typeof payload.etag === 'string' ? payload.etag : response.headers.get('etag');
    // Some Drive upload responses omit ETag. The caller must read the file back
    // and confirm the mutation record before reporting success.
    return { conflict: false, etag: nextEtag || null, readbackRequired: !nextEtag };
  }
}

export const INVENTORY_MAX_BYTES = MAX_BYTES;
