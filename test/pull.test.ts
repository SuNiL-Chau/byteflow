import * as assert from 'node:assert';
import { describe, it } from 'node:test';
import { pull, push, text } from '../dist/index.esm.js';

describe('Stream.pull', () => {
  it('should transform chunks', async () => {
    const { writer, readable } = push();

    writer.write('a');
    writer.write('b');
    writer.end();

    const transformed = pull(readable, (chunk: Uint8Array) => {
      // transform each chunk to uppercase
      const str = new TextDecoder().decode(chunk);
      return [new TextEncoder().encode(str.toUpperCase())];
    });

    const result = await text(transformed);
    assert.strictEqual(result, 'AB');
  });

  it('can drop chunks', async () => {
    const { writer, readable } = push();

    writer.write('1');
    writer.write('drop-this');
    writer.write('2');
    writer.end();

    const transformed = pull(readable, (chunk: Uint8Array) => {
      const str = new TextDecoder().decode(chunk);
      if (str === 'drop-this') return [];
      return [chunk];
    });

    const result = await text(transformed);
    assert.strictEqual(result, '12');
  });
});
