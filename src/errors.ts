export class StreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StreamError';
  }
}

export class StreamBackpressureError extends StreamError {
  constructor(message = 'Buffer full') {
    super(message);
    this.name = 'StreamBackpressureError';
  }
}

export class StreamClosedError extends StreamError {
  constructor(message = 'Stream is closed') {
    super(message);
    this.name = 'StreamClosedError';
  }
}

export class StreamAbortError extends StreamError {
  constructor(message = 'Stream was aborted') {
    super(message);
    this.name = 'StreamAbortError';
  }
}
