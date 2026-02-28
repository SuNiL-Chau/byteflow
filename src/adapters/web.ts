import type { ReadableBatchStream } from '../types.js';

export async function* fromWeb(stream: ReadableStream<Uint8Array>): ReadableBatchStream {
    // Convert using async iteration, as requested by PRD
    // Note: Modern engines provide async iterators on ReadableStream
    for await (const chunk of (stream as unknown as AsyncIterable<Uint8Array>)) {
        yield [chunk];
    }
}

export function toWeb(source: ReadableBatchStream): ReadableStream<Uint8Array> {
    // Use ReadableStream.from() as requested by PRD, with fallback for older environments
    const flatten = async function* () {
        for await (const batch of source) {
            for (const chunk of batch) {
                yield chunk;
            }
        }
    };

    const globalReadableStream = (globalThis as any).ReadableStream;
    if (globalReadableStream && typeof globalReadableStream.from === 'function') {
        return globalReadableStream.from(flatten());
    }

    // Fallback for environments where ReadableStream.from is not available
    const iterator = flatten()[Symbol.asyncIterator]();
    return new ReadableStream({
        async pull(controller) {
            const { done, value } = await iterator.next();
            if (done) controller.close();
            else if (value) controller.enqueue(value);
        },
        cancel(reason) {
            if (iterator.throw) iterator.throw(reason).catch(() => { });
        }
    });
}
