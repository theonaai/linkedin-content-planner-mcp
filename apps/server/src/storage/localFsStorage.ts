import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";
import type { StorageAdapter } from "@linkedin-planner/core";

/** Rejects any key that would escape rootDir (e.g. via "../"). */
function resolveSafePath(rootDir: string, key: string): string {
  const resolved = join(rootDir, normalize(key));
  const rel = relative(rootDir, resolved);
  if (rel.startsWith("..") || rel === "") {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return resolved;
}

export function createLocalFsStorage(rootDir: string): StorageAdapter {
  return {
    async save(key, data) {
      const path = resolveSafePath(rootDir, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, data);
    },
    async read(key) {
      return readFile(resolveSafePath(rootDir, key));
    },
    async delete(key) {
      await rm(resolveSafePath(rootDir, key), { force: true });
    },
  };
}
