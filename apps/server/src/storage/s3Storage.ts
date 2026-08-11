import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageAdapter } from "@linkedin-planner/core";

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Set for any S3-compatible provider that isn't AWS itself — Cloudflare R2, MinIO, etc. */
  endpoint?: string;
  /** R2 and most non-AWS S3-compatible providers need path-style addressing
   * (https://endpoint/bucket/key) rather than AWS's virtual-hosted-style
   * (https://bucket.endpoint/key). */
  forcePathStyle?: boolean;
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  // The SDK's Body type varies by runtime (Node stream, web ReadableStream, Blob) — a Node
  // server always gets a Node Readable in practice, but transformToByteArray() is the
  // SDK-provided way to normalize this without depending on which shape it actually is.
  const body = stream as { transformToByteArray: () => Promise<Uint8Array> };
  return Buffer.from(await body.transformToByteArray());
}

export function createS3Storage(config: S3StorageConfig): StorageAdapter {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });

  return {
    async save(key, data) {
      await client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: data }));
    },
    async read(key) {
      const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      if (!res.Body) throw new Error(`No such key: ${key}`);
      return streamToBuffer(res.Body);
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
