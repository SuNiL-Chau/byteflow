import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { push, fromWeb, toWeb, text } from '../dist/index.esm.js';

describe('Adapters', () => {
    it('toWeb and fromWeb roundtrip', async () => {
        const { writer, readable } = push();

        writer.write('hello web streams');
        writer.end();

        const webStream = toWeb(readable);
        assert.ok(webStream instanceof ReadableStream, 'should be Web Stream');

        const backToBetter = fromWeb(webStream);
        const result = await text(backToBetter);

        assert.strictEqual(result, 'hello web streams');
    });
});
