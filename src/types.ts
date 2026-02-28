export interface Writer {
    write(chunk: Uint8Array | string): void | Promise<void>;
    writev(chunks: Uint8Array[]): void | Promise<void>;
    end(): void;
    abort(reason?: unknown): void;
}

export type BackpressureStrategy = 'strict' | 'block' | 'drop-oldest' | 'drop-newest';

export interface PushOptions {
    highWaterMark?: number;
    backpressure?: BackpressureStrategy;
}

export type ReadableBatchStream = AsyncIterable<Uint8Array[]>;

export interface PushResult {
    writer: Writer;
    readable: ReadableBatchStream;
}
