import { EphemeralClip, type FileOps } from './recording';

function fakeFs() {
  const files = new Set<string>();
  const ops: FileOps = {
    async delete(uri) {
      files.delete(uri);
    },
    async exists(uri) {
      return files.has(uri);
    },
  };
  return { files, ops };
}

describe('EphemeralClip — the video never survives (§2.12)', () => {
  it('deletes the attached file and reports deleted', async () => {
    const { files, ops } = fakeFs();
    files.add('cache://set1.mp4');
    const clip = new EphemeralClip(ops);
    clip.attach('cache://set1.mp4');
    expect(clip.currentUri).toBe('cache://set1.mp4');

    await clip.deleteNow();
    expect(files.has('cache://set1.mp4')).toBe(false);
    expect(clip.currentUri).toBeNull();
    expect(clip.isDeleted).toBe(true);
  });

  it('is idempotent across multiple exit paths firing', async () => {
    const { files, ops } = fakeFs();
    files.add('cache://set2.mp4');
    const clip = new EphemeralClip(ops);
    clip.attach('cache://set2.mp4');
    await Promise.all([clip.deleteNow(), clip.deleteNow()]);
    await clip.deleteNow();
    expect(files.size).toBe(0);
  });

  it('a clip that lands after deletion is destroyed on sight', async () => {
    const { files, ops } = fakeFs();
    const clip = new EphemeralClip(ops);
    await clip.deleteNow(); // user backed out before recordAsync resolved
    files.add('cache://late.mp4');
    clip.attach('cache://late.mp4');
    await new Promise((r) => setTimeout(r, 10));
    expect(files.has('cache://late.mp4')).toBe(false);
    expect(clip.currentUri).toBeNull();
  });

  it('retries once when the player still holds the file', async () => {
    let calls = 0;
    const ops: FileOps = {
      async delete() {
        calls += 1;
        if (calls === 1) throw new Error('EBUSY');
      },
      async exists() {
        return false;
      },
    };
    const clip = new EphemeralClip(ops);
    clip.attach('cache://busy.mp4');
    await clip.deleteNow();
    expect(calls).toBe(2);
  });
});
