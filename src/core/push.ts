import type { BackpressureStrategy, PushOptions, PushResult, Writer } from '../types.js';
import { StreamAbortError, StreamBackpressureError } from '../errors.js';

class PushStreamController implements Writer {
    private buffer: Uint8Array[] = [];
    private highWaterMark: number;
    private strategy: BackpressureStrategy;

    private isEnded = false;
    private abortReason: unknown = null;

    private pullQueue: { resolve: (value: IteratorResult<Uint8Array[]>) => void; reject: (reason: unknown) => void }[] = [];

    // To handle the 'block' backpressure strategy
    private writeQueue: { resolve: () => void }[] = [];

    constructor(options: PushOptions = {}) {
        this.highWaterMark = options.highWaterMark ?? 1024 * 16; // arbitrary chunks default
        this.strategy = options.backpressure ?? 'strict';
    }

    private encodeString(str: string): Uint8Array {
        return new TextEncoder().encode(str);
    }

    private processWaiters() {
        if (this.pullQueue.length > 0) {
            if (this.buffer.length > 0) {
                const batch = this.buffer;
                this.buffer = [];
                const waiter = this.pullQueue.shift();
                waiter?.resolve({ value: batch, done: false });
                this.resolveBlockedWriters(); // We drained buffer, unblock writers
            } else if (this.isEnded) {
                while (this.pullQueue.length > 0) {
                    const waiter = this.pullQueue.shift();
                    waiter?.resolve({ value: undefined, done: true });
                }
            } else if (this.abortReason !== null) {
                while (this.pullQueue.length > 0) {
                    const waiter = this.pullQueue.shift();
                    waiter?.reject(this.abortReason);
                }
            }
        }
    }

    private resolveBlockedWriters() {
        while (this.writeQueue.length > 0 && this.buffer.length < this.highWaterMark) {
            const writer = this.writeQueue.shift();
            writer?.resolve();
        }
    }

    private applyBackpressure(): void | Promise<void> {
        if (this.buffer.length >= this.highWaterMark) {
            switch (this.strategy) {
                case 'strict':
                    throw new StreamBackpressureError();
                case 'drop-oldest':
                    this.buffer.shift(); // Drop the oldest chunk
                    break;
                case 'drop-newest':
                    this.buffer.pop(); // Not exactly dropping the *incoming* yet, but dropping the end of queue
                    // Actually, drop-newest means drop the incoming chunks, which we handle in write/writev
                    break;
                case 'block':
                    return new Promise<void>((resolve) => {
                        this.writeQueue.push({ resolve });
                    });
            }
        }
    }

    async write(chunk: Uint8Array | string): Promise<void> {
        if (this.isEnded || this.abortReason) return;

        const data = typeof chunk === 'string' ? this.encodeString(chunk) : chunk;

        if (this.buffer.length >= this.highWaterMark && this.strategy === 'drop-newest') {
            return; // Drop newest (the incoming chunk)
        }

        const wait = this.applyBackpressure();
        if (wait) await wait;

        if (this.isEnded || this.abortReason) return; // double check after async wait

        this.buffer.push(data);
        this.processWaiters();
    }

    async writev(chunks: Uint8Array[]): Promise<void> {
        if (this.isEnded || this.abortReason) return;

        // Simplistic batch write depending on strategy.
        for (const chunk of chunks) {
            await this.write(chunk);
        }
    }

    end(): void {
        this.isEnded = true;
        this.processWaiters();
    }

    abort(reason?: unknown): void {
        if (this.isEnded) return;
        this.abortReason = reason ?? new StreamAbortError();
        this.processWaiters();
        // Reject blocked writers
        while (this.writeQueue.length > 0) {
            const writer = this.writeQueue.shift();
            // Unblock them, perhaps they'll error on completion/next check.
            writer?.resolve();
        }
    }

    // Generate the AsyncIterable stream
    [Symbol.asyncIterator]() {
        return {
            next: (): Promise<IteratorResult<Uint8Array[]>> => {
                return new Promise((resolve, reject) => {
                    if (this.buffer.length > 0) {
                        const batch = this.buffer;
                        this.buffer = [];
                        resolve({ value: batch, done: false });
                        this.resolveBlockedWriters(); // buffer drained
                    } else if (this.isEnded) {
                        resolve({ value: undefined, done: true });
                    } else if (this.abortReason !== null) {
                        reject(this.abortReason);
                    } else {
                        // Wait for data
                        this.pullQueue.push({ resolve, reject });
                    }
                });
            }
        };
    }
}

export function push(options?: PushOptions): PushResult {
    const controller = new PushStreamController(options);

    return {
        writer: controller,
        readable: controller,
    };
}
