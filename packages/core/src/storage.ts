/**
 * Storage contract for attachment bytes, kept separate from attachment metadata (which
 * lives in Postgres). apps/server provides the concrete implementation (local filesystem
 * in v1) so packages/core stays free of Node-fs specifics and this can later swap to an
 * S3-compatible adapter for the cloud version without touching any caller.
 */
export interface StorageAdapter {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}
