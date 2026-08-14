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
  /**
   * Bytes [start, end] inclusive, the same half-open-at-neither-end convention HTTP Range uses.
   * Optional so an adapter can omit it and fall back to a full read, but both shipped adapters
   * implement it: without it a 25 MB video is pulled into memory on every seek, and Safari
   * refuses to play media the server won't serve in ranges at all.
   */
  readRange?(key: string, start: number, end: number): Promise<Buffer>;
}
