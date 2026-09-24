/**
 * One clip's life, from "start recording" to a file Review can play — or to
 * no file at all.
 *
 * This is the part of recording that is easy to get subtly wrong and has
 * nothing to do with cameras, so it lives here where it can be tested without
 * one. Three things make it harder than start/stop:
 *
 *  - A clip is not complete when recording stops. The muxer finalizes it a
 *    moment later, and a path handed to Review before then is a truncated
 *    file that plays for part of a set and stops.
 *
 *  - A recording can end on its own — a duration cap, a camera that went
 *    away — before anyone asks it to. That clip is still the set's clip and
 *    must be there when the stop arrives.
 *
 *  - A clip can finish after the screen that wanted it is gone, or after the
 *    wait for it was given up. Nobody will ever look at that file, and a
 *    recording nobody looks at is exactly what may not be left on the phone
 *    (§2.12). It is deleted the moment it appears.
 */

export interface ClipTarget {
  /** `file://` form, for the app's file helpers and the player */
  uri: string;
  /** bare filesystem path, for a native recorder */
  path: string;
}

export interface ClipRecorderDeps {
  /** where a recorder that needs to be told a path should write */
  target: () => Promise<ClipTarget | null>;
  /** delete a clip nobody is going to see */
  discard: (uri: string) => void;
  /** how long to wait for a clip to finalize before giving up on it */
  timeoutMs: number;
  /** injectable for tests */
  setTimer?: (fn: () => void, ms: number) => unknown;
}

type State = 'idle' | 'recording' | 'stopping';

export class ClipRecorder {
  private state: State = 'idle';
  /** the path a native recorder was given, while it is writing there */
  private target: ClipTarget | null = null;
  /** resolves the pending stop() once the clip is complete */
  private waiter: ((uri: string | null) => void) | null = null;
  /** a clip that finished by itself before stop() was called */
  private completed: string | null = null;
  /** stop() gave up waiting; whatever finishes now is discarded */
  private abandoned = false;
  private disposed = false;

  constructor(private deps: ClipRecorderDeps) {}

  get isRecording(): boolean {
    return this.state !== 'idle';
  }

  /**
   * Start a clip. `begin` does the backend-specific part and is handed the
   * target when `needsTarget` is set. Resolves false — never throws — when
   * nothing was started, so a set is never lost to an optional recording.
   */
  async start(begin: (target: ClipTarget | null) => Promise<void>, needsTarget: boolean): Promise<boolean> {
    if (this.disposed || this.state !== 'idle') return false;
    this.state = 'recording';
    this.completed = null;
    this.abandoned = false;

    let target: ClipTarget | null = null;
    if (needsTarget) {
      target = await this.deps.target();
      if (target === null || this.disposed) {
        this.state = 'idle';
        return false;
      }
    }
    this.target = target;

    try {
      await begin(target);
      return true;
    } catch (e) {
      console.warn('[synapse] recording could not start', e);
      this.state = 'idle';
      this.target = null;
      return false;
    }
  }

  /** The backend's report that the clip is complete: its uri, or null if it failed. */
  finished(uri: string | null): void {
    const waiter = this.waiter;
    this.waiter = null;
    this.state = 'idle';
    this.target = null;

    if (this.disposed || this.abandoned) {
      this.abandoned = false;
      if (uri) this.deps.discard(uri);
      return;
    }
    if (waiter) {
      waiter(uri);
      return;
    }
    // ended by itself before anyone asked — keep it for the stop that is coming
    if (this.completed) this.deps.discard(this.completed);
    this.completed = uri;
  }

  /**
   * For a recorder that was told where to write: it reports only whether the
   * file came out usable. A file that did not is removed rather than left.
   */
  finishedAtTarget(ok: boolean): void {
    const target = this.target;
    if (!ok && target) this.deps.discard(target.uri);
    this.finished(ok && target ? target.uri : null);
  }

  /**
   * Stop, and wait until the clip is complete. Resolves its uri, or null when
   * there is none — never a half-written file.
   */
  async stop(end: () => void | Promise<void>): Promise<string | null> {
    if (this.completed !== null) {
      const uri = this.completed;
      this.completed = null;
      return uri;
    }
    if (this.state !== 'recording') return null;
    this.state = 'stopping';

    const done = new Promise<string | null>((resolve) => {
      this.waiter = resolve;
    });
    try {
      await end();
    } catch {
      // the backend may have stopped on its own already; the wait still decides
    }

    let timedOut = false;
    const timer = new Promise<null>((resolve) => {
      const set = this.deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
      set(() => {
        timedOut = true;
        resolve(null);
      }, this.deps.timeoutMs);
    });

    const uri = await Promise.race([done, timer]);
    if (uri === null && timedOut && this.waiter !== null) {
      // given up on: whatever finalizes after this is deleted, not orphaned
      this.waiter = null;
      this.abandoned = true;
    }
    return uri;
  }

  /**
   * The screen is gone. Anything still on its way is deleted when it lands,
   * and a native recorder's file — whose finish event may never reach a view
   * that no longer exists — is deleted once it would have been finalized.
   */
  dispose(): void {
    this.disposed = true;
    const waiter = this.waiter;
    this.waiter = null;
    waiter?.(null);
    if (this.completed) {
      this.deps.discard(this.completed);
      this.completed = null;
    }
    const target = this.target;
    if (target) {
      const set = this.deps.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
      set(() => this.deps.discard(target.uri), this.deps.timeoutMs);
    }
  }
}
