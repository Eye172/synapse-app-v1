/**
 * A stand-in for `modules/rig-udp` in tests: the same surface as the native
 * module, driven by hand. One fake for every test that needs the native side,
 * so they cannot drift apart from each other.
 *
 * Use it as
 *
 *   const mockRigUdp = new FakeRigUdp();
 *   jest.mock('@/modules/rig-udp', () => ({
 *     __esModule: true,
 *     get default() { return mockRigUdp; },
 *   }));
 */

type Listener = (event: never) => void;

export class FakeRigUdp {
  readonly listeners = new Map<string, Listener[]>();
  readonly binds: number[] = [];
  closes = 0;
  /** set to make the next bind() reject with it */
  bindFailure: Error | null = null;

  addListener(name: string, cb: Listener): { remove(): void } {
    const list = this.listeners.get(name) ?? [];
    list.push(cb);
    this.listeners.set(name, list);
    return {
      remove: () => {
        this.listeners.set(name, (this.listeners.get(name) ?? []).filter((x) => x !== cb));
      },
    };
  }

  async bind(port: number): Promise<void> {
    this.binds.push(port);
    if (this.bindFailure) throw this.bindFailure;
  }

  async close(): Promise<void> {
    this.closes += 1;
  }

  addresses(): string[] {
    return [];
  }

  emit(name: string, event: unknown): void {
    for (const cb of [...(this.listeners.get(name) ?? [])]) (cb as (e: unknown) => void)(event);
  }

  get liveListeners(): number {
    let n = 0;
    for (const list of this.listeners.values()) n += list.length;
    return n;
  }

  reset(): void {
    this.listeners.clear();
    this.binds.length = 0;
    this.closes = 0;
    this.bindFailure = null;
  }
}

/** Native calls go through a promise chain; let it drain. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
