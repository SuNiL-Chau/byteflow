import assert from 'node:assert';
import test from 'node:test';
import { Queue } from '../src/core/queue.ts';

test('Queue - init', () => {
  const q = new Queue<number>();
  assert.strictEqual(q.length, 0);
  assert.strictEqual(q.peek(), undefined);
});

test('Queue - enqueue and dequeue', () => {
  const q = new Queue<string>();

  q.enqueue('a');
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q.peek(), 'a');

  q.enqueue('b');
  assert.strictEqual(q.length, 2);
  assert.strictEqual(q.peek(), 'a');

  assert.strictEqual(q.dequeue(), 'a');
  assert.strictEqual(q.length, 1);
  assert.strictEqual(q.peek(), 'b');

  assert.strictEqual(q.dequeue(), 'b');
  assert.strictEqual(q.length, 0);
  assert.strictEqual(q.peek(), undefined);

  // dequeue empty
  assert.strictEqual(q.dequeue(), undefined);
  assert.strictEqual(q.length, 0);
});

test('Queue - pop (drop-newest)', () => {
  const q = new Queue<number>();

  q.enqueue(1);
  q.enqueue(2);
  q.enqueue(3);

  assert.strictEqual(q.length, 3);

  assert.strictEqual(q.pop(), 3);
  assert.strictEqual(q.length, 2);

  assert.strictEqual(q.pop(), 2);
  assert.strictEqual(q.length, 1);

  assert.strictEqual(q.pop(), 1);
  assert.strictEqual(q.length, 0);

  // pop empty
  assert.strictEqual(q.pop(), undefined);
});

test('Queue - pop with enqueue mixing', () => {
  const q = new Queue<number>();

  q.enqueue(1);
  q.enqueue(2);

  assert.strictEqual(q.pop(), 2);
  q.enqueue(3);

  assert.strictEqual(q.dequeue(), 1);
  assert.strictEqual(q.dequeue(), 3);
  assert.strictEqual(q.length, 0);
});

test('Queue - drain', () => {
  const q = new Queue<number>();

  q.enqueue(10);
  q.enqueue(20);
  q.enqueue(30);

  const values = q.drain();
  assert.deepStrictEqual(values, [10, 20, 30]);
  assert.strictEqual(q.length, 0);
  assert.strictEqual(q.peek(), undefined);
});
