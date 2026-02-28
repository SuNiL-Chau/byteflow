import type { ReadableBatchStream } from '../types.js';

export async function bytes(source: ReadableBatchStream): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    for await (const batch of source) {
        for (const chunk of batch) {
            chunks.push(chunk);
            totalLength += chunk.length;
        }
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
    }

    return result;
}

export async function text(source: ReadableBatchStream): Promise<string> {
    const buffer = await bytes(source);
    return new TextDecoder().decode(buffer);
}

export async function json<T = unknown>(source: ReadableBatchStream): Promise<T> {
    const txt = await text(source);
    return JSON.parse(txt) as T;
}
