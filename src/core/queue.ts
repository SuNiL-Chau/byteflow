/**
 * A lightweight, O(1) Singly Linked List Queue.
 * Designed to replace `Array.prototype.shift()` which is O(N).
 */

class Node<T> {
  value: T;
  next: Node<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }
}

export class Queue<T> {
  private head: Node<T> | null = null;
  private tail: Node<T> | null = null;
  private _length = 0;

  /**
   * Get the number of items in the queue. O(1).
   */
  get length(): number {
    return this._length;
  }

  /**
   * Add an item to the end of the queue. O(1).
   */
  enqueue(value: T): void {
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
  dequeue(): T | undefined {
    if (!this.head) {
      return undefined;
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
  pop(): T | undefined {
    if (!this.head) return undefined;

    if (this.head === this.tail) {
      const value = this.head.value;
      this.head = null;
      this.tail = null;
      this._length = 0;
      return value;
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
  drain(): T[] {
    const result: T[] = [];
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

  peek(): T | undefined {
    return this.head?.value;
  }
}
