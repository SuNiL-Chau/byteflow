import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { push } from '../dist/index.esm.js';

describe('Stream.push', () => {
  it('should stream chunks as batches', async () => {
    const { writer, readable } = push({ highWaterMark: 10 });

    writer.write('hello');
    writer.write(' ');
    writer.write('world');
    writer.end();

    const batches: Uint8Array[][] = [];
    for await (const batch of readable) {
      batches.push(batch);
    }

    assert.strictEqual(batches.length > 0, true);
    // Since we wrote synchronously and end synchronously before reading,
    // they might arrive in one single batch.
    const chunks = batches.flat();
    assert.strictEqual(chunks.length, 3);
    assert.strictEqual(new TextDecoder().decode(chunks[0]), 'hello');
  });

  it('strict backpressure should throw', async () => {
    const { writer } = push({ highWaterMark: 2, backpressure: 'strict' });

    await writer.write('1');
    await writer.write('2');

    await assert.rejects(async () => {
      await writer.write('3');
    }, /StreamBackpressureError/);
  });
});
