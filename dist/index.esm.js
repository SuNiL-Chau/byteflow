import { Readable } from 'stream';

// src/errors.ts
var StreamError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "StreamError";
  }
};
var StreamBackpressureError = class extends StreamError {
  constructor(message = "Buffer full") {
    super(message);
    this.name = "StreamBackpressureError";
  }
};
var StreamClosedError = class extends StreamError {
  constructor(message = "Stream is closed") {
    super(message);
    this.name = "StreamClosedError";
  }
};
var StreamAbortError = class extends StreamError {
  constructor(message = "Stream was aborted") {
    super(message);
    this.name = "StreamAbortError";
  }
};

// src/core/queue.ts
var Node = class {
  value;
  next = null;
  constructor(value) {
    this.value = value;
  }
};
var Queue = class {
  head = null;
  tail = null;
  _length = 0;
  /**
   * Get the number of items in the queue. O(1).
   */
  get length() {
    return this._length;
  }
  /**
   * Add an item to the end of the queue. O(1).
   */
  enqueue(value) {
    const node = new Node(value);
    if (this.tail) {
      this.tail.next = node;
      this.tail = node;
    } else {
      this.head = node;
      this.tail = node;
    }
    this._length++;
  }
  /**
   * Remove and return the item from the front of the queue. O(1).
   */
  dequeue() {
    if (!this.head) {
      return void 0;
    }
    const value = this.head.value;
    this.head = this.head.next;
    if (!this.head) {
      this.tail = null;
    }
    this._length--;
    return value;
  }
  /**
   * Remove and return the item from the back of the queue (drop-newest). O(n).
   * Since this is a singly linked list, popping the tail requires traversing from the head.
   * Note: This is an acceptable O(n) tradeoff because 'drop-newest' is a backpressure
   * mitigation strategy explicitly chosen to drop data, not the happy-path `dequeue`.
   */
  pop() {
    if (!this.head) return void 0;
    if (this.head === this.tail) {
      const value2 = this.head.value;
      this.head = null;
      this.tail = null;
      this._length = 0;
      return value2;
    }
    let current = this.head;
    while (current.next && current.next !== this.tail) {
      current = current.next;
    }
    const value = this.tail?.value;
    current.next = null;
    this.tail = current;
    this._length--;
    return value;
  }
  /**
   * Extract all remaining items into an array and clear the queue. O(N).
   */
  drain() {
    const result = [];
    let current = this.head;
    while (current) {
      result.push(current.value);
      current = current.next;
    }
    this.head = null;
    this.tail = null;
    this._length = 0;
    return result;
  }
  peek() {
    return this.head?.value;
  }
};

// src/core/push.ts
var PushStreamController = class {
  buffer = new Queue();
  highWaterMark;
  strategy;
  isEnded = false;
  abortReason = null;
  pullQueue = new Queue();
  // To handle the 'block' backpressure strategy
  writeQueue = new Queue();
  constructor(options = {}) {
    this.highWaterMark = options.highWaterMark ?? 1024 * 16;
    this.strategy = options.backpressure ?? "strict";
  }
  encodeString(str) {
    return new TextEncoder().encode(str);
  }
  processWaiters() {
    if (this.pullQueue.length > 0) {
      if (this.buffer.length > 0) {
        const batch = this.buffer.drain();
        const waiter = this.pullQueue.dequeue();
        waiter?.resolve({ value: batch, done: false });
        this.resolveBlockedWriters();
      } else if (this.isEnded) {
        while (this.pullQueue.length > 0) {
          const waiter = this.pullQueue.dequeue();
          waiter?.resolve({ value: void 0, done: true });
        }
      } else if (this.abortReason !== null) {
        while (this.pullQueue.length > 0) {
          const waiter = this.pullQueue.dequeue();
          waiter?.reject(this.abortReason);
        }
      }
    }
  }
  resolveBlockedWriters() {
    while (this.writeQueue.length > 0 && this.buffer.length < this.highWaterMark) {
      const writer = this.writeQueue.dequeue();
      writer?.resolve();
    }
  }
  applyBackpressure() {
    if (this.buffer.length >= this.highWaterMark) {
      switch (this.strategy) {
        case "strict":
          throw new StreamBackpressureError();
        case "drop-oldest":
          this.buffer.dequeue();
          break;
        case "drop-newest":
          this.buffer.pop();
          break;
        case "block":
          return new Promise((resolve) => {
            this.writeQueue.enqueue({ resolve });
          });
      }
    }
  }
  async write(chunk) {
    if (this.isEnded || this.abortReason) return;
    const data = typeof chunk === "string" ? this.encodeString(chunk) : chunk;
    if (this.buffer.length >= this.highWaterMark && this.strategy === "drop-newest") {
      return;
    }
    const wait = this.applyBackpressure();
    if (wait) await wait;
    if (this.isEnded || this.abortReason) return;
    this.buffer.enqueue(data);
    this.processWaiters();
  }
  async writev(chunks) {
    if (this.isEnded || this.abortReason) return;
    for (const chunk of chunks) {
      await this.write(chunk);
    }
  }
  end() {
    this.isEnded = true;
    this.processWaiters();
  }
  abort(reason) {
    if (this.isEnded) return;
    this.abortReason = reason ?? new StreamAbortError();
    this.processWaiters();
    while (this.writeQueue.length > 0) {
      const writer = this.writeQueue.dequeue();
      writer?.resolve();
    }
  }
  // Generate the AsyncIterable stream
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        return new Promise((resolve, reject) => {
          if (this.buffer.length > 0) {
            const batch = this.buffer.drain();
            resolve({ value: batch, done: false });
            this.resolveBlockedWriters();
          } else if (this.isEnded) {
            resolve({ value: void 0, done: true });
          } else if (this.abortReason !== null) {
            reject(this.abortReason);
          } else {
            this.pullQueue.enqueue({ resolve, reject });
          }
        });
      }
    };
  }
};
function push(options) {
  const controller = new PushStreamController(options);
  return {
    writer: controller,
    readable: controller
  };
}

// src/core/pull.ts
async function* pull(source, ...transforms) {
  for await (const batch of source) {
    let currentBatch = batch;
    for (const transform of transforms) {
      const nextBatch = [];
      for (const chunk of currentBatch) {
        const result = await transform(chunk);
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
function* pullSync(source, ...transforms) {
  for (const batch of source) {
    let currentBatch = batch;
    for (const transform of transforms) {
      const nextBatch = [];
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

// src/core/share.ts
function share(source, options) {
  const consumers = [];
  let isConsuming = false;
  async function consume() {
    isConsuming = true;
    try {
      for await (const batch of source) {
        if (consumers.length === 0) {
          continue;
        }
        await Promise.all(consumers.map((c) => c.writer.writev(batch)));
      }
      for (const consumer of consumers) {
        consumer.writer.end();
      }
    } catch (error) {
      for (const consumer of consumers) {
        consumer.writer.abort(error);
      }
    }
  }
  return {
    pull(...transforms) {
      const consumer = push(options);
      consumers.push(consumer);
      if (!isConsuming) {
        consume().catch(console.error);
      }
      if (transforms.length > 0) {
        return pull(consumer.readable, ...transforms);
      }
      return consumer.readable;
    }
  };
}

// src/core/helpers.ts
async function bytes(source) {
  const chunks = [];
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
async function text(source) {
  const buffer = await bytes(source);
  return new TextDecoder().decode(buffer);
}
async function json(source) {
  const txt = await text(source);
  return JSON.parse(txt);
}

// src/adapters/web.ts
async function* fromWeb(stream) {
  for await (const chunk of stream) {
    yield [chunk];
  }
}
function toWeb(source) {
  const flatten = async function* () {
    for await (const batch of source) {
      for (const chunk of batch) {
        yield chunk;
      }
    }
  };
  const globalReadableStream = globalThis.ReadableStream;
  if (globalReadableStream && typeof globalReadableStream.from === "function") {
    return globalReadableStream.from(flatten());
  }
  const iterator = flatten()[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await iterator.next();
      if (done) controller.close();
      else if (value) controller.enqueue(value);
    },
    cancel(reason) {
      if (iterator.throw) iterator.throw(reason).catch(() => {
      });
    }
  });
}
async function* fromNode(stream) {
  for await (const chunk of stream) {
    if (chunk instanceof Uint8Array) {
      yield [chunk];
    } else if (chunk && typeof chunk.byteLength === "number") {
      yield [new Uint8Array(chunk.buffer || chunk)];
    } else if (typeof chunk === "string") {
      yield [new TextEncoder().encode(chunk)];
    } else {
      throw new Error(`Unsupported chunk type in fromNode: ${typeof chunk}`);
    }
  }
}
function toNode(source) {
  return Readable.from(
    (async function* () {
      for await (const batch of source) {
        for (const chunk of batch) {
          yield chunk;
        }
      }
    })()
  );
}

// src/core/plugin.ts
var defaultContext = {
  push,
  pull,
  share
};
function use(plugin, options) {
  return plugin.apply(defaultContext, options);
}

export { StreamAbortError, StreamBackpressureError, StreamClosedError, StreamError, bytes, fromNode, fromWeb, json, pull, pullSync, push, share, text, toNode, toWeb, use };
//# sourceMappingURL=index.esm.js.map
//# sourceMappingURL=index.esm.js.map