type Task<T> = () => Promise<T>;

class AsyncQueue {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly concurrency: number) {}

  add<T>(task: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        this.running++;
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        } finally {
          this.running--;
          if (this.queue.length > 0) this.queue.shift()!();
        }
      };
      if (this.running < this.concurrency) run();
      else this.queue.push(run);
    });
  }

  get size(): number { return this.queue.length; }
  get active(): number { return this.running; }
}

export const scanQueue = new AsyncQueue(3);
