import { ClipRecorder, type ClipTarget } from './clipRecorder';

const TARGET: ClipTarget = { uri: 'file:///cache/Camera/set-1.mp4', path: '/cache/Camera/set-1.mp4' };

function harness(opts: { target?: ClipTarget | null } = {}) {
  const discarded: string[] = [];
  const timers: (() => void)[] = [];
  const recorder = new ClipRecorder({
    target: async () => (opts.target === undefined ? TARGET : opts.target),
    discard: (uri) => discarded.push(uri),
    timeoutMs: 4000,
    // timers fire only when the test says so
    setTimer: (fn) => timers.push(fn),
  });
  const fireTimers = () => {
    while (timers.length) timers.shift()!();
  };
  return { recorder, discarded, fireTimers };
}

/** let queued promise callbacks run */
const flush = () => new Promise((r) => setImmediate(r));

describe('ClipRecorder', () => {
  describe('starting', () => {
    it('hands a native recorder the target path', async () => {
      const { recorder } = harness();
      const begin = jest.fn(async () => {});
      expect(await recorder.start(begin, true)).toBe(true);
      expect(begin).toHaveBeenCalledWith(TARGET);
      expect(recorder.isRecording).toBe(true);
    });

    it('reports false rather than throwing when the backend refuses', async () => {
      const { recorder } = harness();
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      expect(await recorder.start(async () => { throw new Error('no recorder bound'); }, true)).toBe(false);
      expect(recorder.isRecording).toBe(false);
      warn.mockRestore();
    });

    it('does not start without somewhere to write', async () => {
      const { recorder } = harness({ target: null });
      const begin = jest.fn(async () => {});
      expect(await recorder.start(begin, true)).toBe(false);
      expect(begin).not.toHaveBeenCalled();
    });

    it('will not start a second clip over the first', async () => {
      const { recorder } = harness();
      await recorder.start(async () => {}, true);
      expect(await recorder.start(async () => {}, true)).toBe(false);
    });
  });

  describe('stopping', () => {
    /**
     * The file is not complete when recording stops. Resolving with the path
     * at stop would hand Review a clip that plays for part of the set.
     */
    it('waits for the clip to be finalized, not merely stopped', async () => {
      const { recorder } = harness();
      await recorder.start(async () => {}, true);
      let result: string | null | undefined;
      const stopping = recorder.stop(() => {}).then((u) => (result = u));
      await flush();
      expect(result).toBeUndefined();

      recorder.finishedAtTarget(true);
      await stopping;
      expect(result).toBe(TARGET.uri);
    });

    it('resolves null, and removes the file, when the muxer reports failure', async () => {
      const { recorder, discarded } = harness();
      await recorder.start(async () => {}, true);
      const stopping = recorder.stop(() => {});
      recorder.finishedAtTarget(false);
      expect(await stopping).toBeNull();
      expect(discarded).toEqual([TARGET.uri]);
    });

    it('hands over a clip that ended on its own before stop was asked', async () => {
      const { recorder, discarded } = harness();
      await recorder.start(async () => {}, false);
      // a duration cap ends the recording by itself
      recorder.finished('file:///cache/Camera/expo-1.mp4');
      expect(await recorder.stop(() => {})).toBe('file:///cache/Camera/expo-1.mp4');
      expect(discarded).toEqual([]);
    });

    it('gives up after the timeout and deletes the clip if it turns up later', async () => {
      const { recorder, discarded, fireTimers } = harness();
      await recorder.start(async () => {}, true);
      const stopping = recorder.stop(() => {});
      await flush();
      fireTimers();
      expect(await stopping).toBeNull();

      recorder.finishedAtTarget(true);
      expect(discarded).toEqual([TARGET.uri]);
    });

    it('returns null when nothing was recording', async () => {
      const { recorder } = harness();
      expect(await recorder.stop(() => {})).toBeNull();
    });

    it('still waits if the backend throws while stopping', async () => {
      const { recorder } = harness();
      await recorder.start(async () => {}, true);
      const stopping = recorder.stop(() => {
        throw new Error('already stopped');
      });
      await flush();
      recorder.finishedAtTarget(true);
      expect(await stopping).toBe(TARGET.uri);
    });
  });

  describe('after the screen is gone', () => {
    it('deletes a clip that finishes once nobody is waiting for it', async () => {
      const { recorder, discarded } = harness();
      await recorder.start(async () => {}, false);
      recorder.dispose();
      recorder.finished('file:///cache/Camera/late.mp4');
      expect(discarded).toContain('file:///cache/Camera/late.mp4');
    });

    /**
     * A native recorder's finish event is addressed to its view; once the view
     * is unmounted that event may never be delivered, so the file is removed
     * once it would have been finalized rather than left for the next launch.
     */
    it('deletes a native clip whose finish event may never arrive', async () => {
      const { recorder, discarded, fireTimers } = harness();
      await recorder.start(async () => {}, true);
      recorder.dispose();
      expect(discarded).toEqual([]);
      fireTimers();
      expect(discarded).toEqual([TARGET.uri]);
    });

    it('releases a pending stop instead of leaving it hanging', async () => {
      const { recorder } = harness();
      await recorder.start(async () => {}, true);
      const stopping = recorder.stop(() => {});
      await flush();
      recorder.dispose();
      expect(await stopping).toBeNull();
    });

    it('deletes a finished clip that was never collected', async () => {
      const { recorder, discarded } = harness();
      await recorder.start(async () => {}, false);
      recorder.finished('file:///cache/Camera/uncollected.mp4');
      recorder.dispose();
      expect(discarded).toEqual(['file:///cache/Camera/uncollected.mp4']);
    });

    it('starts nothing new', async () => {
      const { recorder } = harness();
      recorder.dispose();
      expect(await recorder.start(async () => {}, true)).toBe(false);
    });
  });
});
