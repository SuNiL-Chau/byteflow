import type { ReadableBatchStream } from '../types.js';

export type Transform = (chunk: Uint8Array) => Uint8Array[] | Promise<Uint8Array[]>;
export type SyncTransform = (chunk: Uint8Array) => Uint8Array[];

export async function* pull(
    source: ReadableBatchStream,
    ...transforms: Transform[]
): ReadableBatchStream {
    for await (const batch of source) {
        let currentBatch: Uint8Array[] = batch;

        for (const transform of transforms) {
            const nextBatch: Uint8Array[] = [];
            for (const chunk of currentBatch) {
                const result = await transform(chunk);
                nextBatch.push(...result);
            }
            currentBatch = nextBatch;
            if (currentBatch.length === 0) break; // Early exit if a transform drops everything
        }

        if (currentBatch.length > 0) {
            yield currentBatch;
        }
    }
}

export function* pullSync(
    source: Iterable<Uint8Array[]>,
    ...transforms: SyncTransform[]
): Iterable<Uint8Array[]> {
    for (const batch of source) {
        let currentBatch: Uint8Array[] = batch;

        for (const transform of transforms) {
            const nextBatch: Uint8Array[] = [];
            for (const chunk of currentBatch) {
                const result = transform(chunk);
                nextBatch.push(...result);
            }
            currentBatch = nextBatch;
            if (currentBatch.length === 0) break;
        }

        if (currentBatch.length > 0) {
            yield currentBatch;
        }
    }
}
