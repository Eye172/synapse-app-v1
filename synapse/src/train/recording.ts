/**
 * Ephemeral recording (§2.12, deal-breaker 1). A clip may exist only:
 *   app-private cache → REVIEW screen → hard-deleted.
 * Deletion fires on every exit path: advancing to the report, going back,
 * app backgrounding, or unmount. Never MediaStore, never upload.
 */

export interface FileOps {
  delete(uri: string): Promise<void>;
  exists(uri: string): Promise<boolean>;
}

function loadDefaultFileOps(): FileOps {
  return {
    async delete(uri: string) {
      // legacy API keeps a stable, promise-based delete with idempotent flag
      const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
      await FileSystem.deleteAsync(uri, { idempotent: true });
    },
    async exists(uri: string) {
      const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
      const info = await FileSystem.getInfoAsync(uri);
      return info.exists === true;
    },
  };
}

/**
 * Crash insurance: if the process was killed mid-set, a clip could outlive
 * its manager in the camera cache. Sweep it on every app start so no
 * recording ever survives a session by any path (§2.12).
 */
export async function purgeStaleClips(): Promise<void> {
  try {
    const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const base = FileSystem.cacheDirectory;
    if (!base) return;
    const cameraDir = `${base}Camera`;
    const info = await FileSystem.getInfoAsync(cameraDir);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(cameraDir);
    await Promise.all(
      files.map((f) =>
        FileSystem.deleteAsync(`${cameraDir}/${f}`, { idempotent: true }).catch(() => {}),
      ),
    );
    if (files.length > 0) console.log(`[synapse] purged ${files.length} stale clip(s)`);
  } catch {
    // sweep is best-effort; the web harness has no filesystem
  }
}

export class EphemeralClip {
  private uri: string | null = null;
  private deleted = false;
  private ops: FileOps;

  constructor(ops?: FileOps) {
    this.ops = ops ?? loadDefaultFileOps();
  }

  attach(uri: string): void {
    if (this.deleted) {
      // a clip that arrives after its manager was killed is deleted on sight
      void this.ops.delete(uri).catch(() => {});
      return;
    }
    this.uri = uri;
  }

  get currentUri(): string | null {
    return this.deleted ? null : this.uri;
  }

  get isDeleted(): boolean {
    return this.deleted;
  }

  /** Hard delete. Idempotent; never throws; safe to call from any exit path. */
  async deleteNow(): Promise<void> {
    this.deleted = true;
    const uri = this.uri;
    this.uri = null;
    if (!uri) return;
    try {
      await this.ops.delete(uri);
    } catch (e) {
      // retry once — a busy player handle can hold the file for a beat
      await new Promise((r) => setTimeout(r, 250));
      try {
        await this.ops.delete(uri);
      } catch (e2) {
        console.error('[synapse] ephemeral delete failed', e2);
      }
    }
  }
}
