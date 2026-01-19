/**
 * HTTP/HTTPS Interceptor Core
 *
 * This module monkey-patches Node.js's http.request and https.request
 * to capture all outgoing network traffic without modifying behavior.
 */

import http from "node:http";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { URL } from "node:url";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// Types
// ============================================================================

export interface RequestStartEvent {
  id: string;
  method: string;
  url: string;
  protocol: "http" | "https";
  host: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  startTime: number;
}

export interface RequestBodyEvent {
  id: string;
  body: string;
}

export interface ResponseHeadersEvent {
  id: string;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface ResponseCompleteEvent {
  id: string;
  body: string;
  duration: number;
}

export interface RequestErrorEvent {
  id: string;
  error: string;
  duration: number;
}

export interface TimingUpdateEvent {
  id: string;
  dns: number;
  tcp: number;
  ttfb: number;
  download: number;
  total: number;
}

export interface InterceptorEvents {
  "request-start": (event: RequestStartEvent) => void;
  "request-body": (event: RequestBodyEvent) => void;
  "response-headers": (event: ResponseHeadersEvent) => void;
  "response-complete": (event: ResponseCompleteEvent) => void;
  "request-error": (event: RequestErrorEvent) => void;
  "timing-update": (event: TimingUpdateEvent) => void;
}

// ============================================================================
// Typed Event Emitter
// ============================================================================

class TypedEventEmitter extends EventEmitter {
  override emit<K extends keyof InterceptorEvents>(
    event: K,
    ...args: Parameters<InterceptorEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  override on<K extends keyof InterceptorEvents>(
    event: K,
    listener: InterceptorEvents[K],
  ): this {
    return super.on(event, listener);
  }

  override off<K extends keyof InterceptorEvents>(
    event: K,
    listener: InterceptorEvents[K],
  ): this {
    return super.off(event, listener);
  }
}

// ============================================================================
// Interceptor State
// ============================================================================

export const interceptorEmitter = new TypedEventEmitter();

// Store original functions
let originalHttpRequest: typeof http.request | null = null;
let originalHttpsRequest: typeof https.request | null = null;
let originalHttpGet: typeof http.get | null = null;
let originalHttpsGet: typeof https.get | null = null;

let isIntercepting = false;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse request arguments to extract options and callback.
 * Node.js has multiple overloaded signatures for http.request:
 * - request(url, callback)
 * - request(url, options, callback)
 * - request(options, callback)
 */
function parseRequestArgs(
  args: unknown[],
  protocol: "http" | "https",
): {
  options: http.RequestOptions;
  callback?: (res: http.IncomingMessage) => void;
} {
  let options: http.RequestOptions = {};
  let callback: ((res: http.IncomingMessage) => void) | undefined;

  if (typeof args[0] === "string") {
    // First arg is URL string
    const urlObj = new URL(args[0]);
    options = {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (protocol === "https" ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "GET",
    };

    if (typeof args[1] === "function") {
      callback = args[1] as (res: http.IncomingMessage) => void;
    } else if (typeof args[1] === "object" && args[1] !== null) {
      options = { ...options, ...(args[1] as http.RequestOptions) };
      if (typeof args[2] === "function") {
        callback = args[2] as (res: http.IncomingMessage) => void;
      }
    }
  } else if (args[0] instanceof URL) {
    // First arg is URL object
    const urlObj = args[0];
    options = {
      protocol: urlObj.protocol,
      hostname: urlObj.hostname,
      port: urlObj.port || (protocol === "https" ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: "GET",
    };

    if (typeof args[1] === "function") {
      callback = args[1] as (res: http.IncomingMessage) => void;
    } else if (typeof args[1] === "object" && args[1] !== null) {
      options = { ...options, ...(args[1] as http.RequestOptions) };
      if (typeof args[2] === "function") {
        callback = args[2] as (res: http.IncomingMessage) => void;
      }
    }
  } else if (typeof args[0] === "object" && args[0] !== null) {
    // First arg is options object
    options = args[0] as http.RequestOptions;
    if (typeof args[1] === "function") {
      callback = args[1] as (res: http.IncomingMessage) => void;
    }
  }

  return { options, callback };
}

/**
 * Build full URL from request options
 */
function buildUrl(
  options: http.RequestOptions,
  protocol: "http" | "https",
): string {
  const host = options.hostname || options.host || "localhost";
  const port = options.port;
  const path = options.path || "/";

  let url = `${protocol}://${host}`;

  if (port && port !== 80 && port !== 443) {
    url += `:${port}`;
  }

  url += path;

  return url;
}

/**
 * Safely stringify body chunks
 */
function stringifyBody(chunks: Buffer[]): string {
  try {
    const buffer = Buffer.concat(chunks);
    return buffer.toString("utf-8");
  } catch {
    return "[Binary data]";
  }
}

// ============================================================================
// Interceptor Factory
// ============================================================================

function createInterceptor(
  originalFn: typeof http.request,
  protocol: "http" | "https",
): typeof http.request {
  return function interceptedRequest(
    this: unknown,
    ...args: unknown[]
  ): http.ClientRequest {
    const { options, callback } = parseRequestArgs(args, protocol);

    const requestId = uuidv4();
    const startTime = Date.now();
    const method = (options.method || "GET").toUpperCase();
    const url = buildUrl(options, protocol);
    const host = options.hostname || options.host || "localhost";
    const path = options.path || "/";

    // Emit request start event
    interceptorEmitter.emit("request-start", {
      id: requestId,
      method,
      url,
      protocol,
      host,
      path,
      headers: (options.headers || {}) as Record<
        string,
        string | string[] | undefined
      >,
      startTime,
    });

    // Timing breakdown tracker (shared between socket events and response handler)
    const timing = {
      dnsStart: startTime,
      dnsEnd: 0,
      tcpEnd: 0,
      ttfbEnd: 0,
      downloadEnd: 0,
    };

    // Create wrapped callback to intercept response
    const wrappedCallback = (res: http.IncomingMessage) => {
      // Emit response headers
      interceptorEmitter.emit("response-headers", {
        id: requestId,
        statusCode: res.statusCode || 0,
        statusMessage: res.statusMessage || "",
        headers: res.headers as Record<string, string | string[] | undefined>,
      });

      // Capture response body using PassThrough
      const responseChunks: Buffer[] = [];

      // Create a pass-through to capture data without consuming it
      const originalOn = res.on.bind(res);
      const originalOnce = res.once.bind(res);

      // Track if we've seen data/end events
      let dataListeners: Array<(chunk: Buffer) => void> = [];
      let endListeners: Array<() => void> = [];

      // Override on to capture data and end events
      res.on = function (
        event: string,
        listener: (...args: unknown[]) => void,
      ) {
        if (event === "data") {
          dataListeners.push(listener as (chunk: Buffer) => void);
          return originalOn(event, (chunk: Buffer) => {
            responseChunks.push(
              Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
            );
            listener(chunk);
          });
        } else if (event === "end") {
          endListeners.push(listener as () => void);
          return originalOn(event, () => {
            const endTime = Date.now();
            timing.downloadEnd = endTime;
            const duration = endTime - startTime;

            // Emit timing breakdown
            const dns = timing.dnsEnd ? timing.dnsEnd - startTime : 0;
            const tcp = timing.tcpEnd
              ? timing.tcpEnd - (timing.dnsEnd || startTime)
              : 0;
            const ttfb = timing.ttfbEnd
              ? timing.ttfbEnd - (timing.tcpEnd || timing.dnsEnd || startTime)
              : 0;
            const download =
              timing.downloadEnd -
              (timing.ttfbEnd || timing.tcpEnd || timing.dnsEnd || startTime);

            interceptorEmitter.emit("timing-update", {
              id: requestId,
              dns,
              tcp,
              ttfb,
              download,
              total: duration,
            });

            interceptorEmitter.emit("response-complete", {
              id: requestId,
              body: stringifyBody(responseChunks),
              duration,
            });
            listener();
          });
        }
        return originalOn(event, listener);
      } as typeof res.on;

      res.once = function (
        event: string,
        listener: (...args: unknown[]) => void,
      ) {
        if (event === "data") {
          return originalOnce(event, (chunk: Buffer) => {
            responseChunks.push(
              Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
            );
            listener(chunk);
          });
        } else if (event === "end") {
          return originalOnce(event, () => {
            const endTime = Date.now();
            timing.downloadEnd = endTime;
            const duration = endTime - startTime;

            const dns = timing.dnsEnd ? timing.dnsEnd - startTime : 0;
            const tcp = timing.tcpEnd
              ? timing.tcpEnd - (timing.dnsEnd || startTime)
              : 0;
            const ttfb = timing.ttfbEnd
              ? timing.ttfbEnd - (timing.tcpEnd || timing.dnsEnd || startTime)
              : 0;
            const download =
              timing.downloadEnd -
              (timing.ttfbEnd || timing.tcpEnd || timing.dnsEnd || startTime);

            interceptorEmitter.emit("timing-update", {
              id: requestId,
              dns,
              tcp,
              ttfb,
              download,
              total: duration,
            });

            interceptorEmitter.emit("response-complete", {
              id: requestId,
              body: stringifyBody(responseChunks),
              duration,
            });
            listener();
          });
        }
        return originalOnce(event, listener);
      } as typeof res.once;

      // Handle case where response is consumed via pipe
      const originalPipe = res.pipe.bind(res);
      res.pipe = function <T extends NodeJS.WritableStream>(
        destination: T,
        options?: { end?: boolean },
      ): T {
        // Create a PassThrough to capture data
        const passThrough = new PassThrough();

        passThrough.on("data", (chunk: Buffer) => {
          responseChunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk),
          );
        });

        passThrough.on("end", () => {
          const endTime = Date.now();
          timing.downloadEnd = endTime;
          const duration = endTime - startTime;

          const dns = timing.dnsEnd ? timing.dnsEnd - startTime : 0;
          const tcp = timing.tcpEnd
            ? timing.tcpEnd - (timing.dnsEnd || startTime)
            : 0;
          const ttfb = timing.ttfbEnd
            ? timing.ttfbEnd - (timing.tcpEnd || timing.dnsEnd || startTime)
            : 0;
          const download =
            timing.downloadEnd -
            (timing.ttfbEnd || timing.tcpEnd || timing.dnsEnd || startTime);

          interceptorEmitter.emit("timing-update", {
            id: requestId,
            dns,
            tcp,
            ttfb,
            download,
            total: duration,
          });

          interceptorEmitter.emit("response-complete", {
            id: requestId,
            body: stringifyBody(responseChunks),
            duration,
          });
        });

        // Pipe through our passthrough first, then to destination
        originalPipe(passThrough, { end: false });
        return passThrough.pipe(destination, options);
      } as typeof res.pipe;

      // Call the original callback if provided
      if (callback) {
        callback(res);
      }
    };

    // Call original function with our wrapped callback
    // We use type assertion here because TypeScript's http.request overloads are complex
    let clientRequest: http.ClientRequest;
    const fn = originalFn as (...args: unknown[]) => http.ClientRequest;

    if (typeof args[0] === "string" || args[0] instanceof URL) {
      if (
        typeof args[1] === "object" &&
        args[1] !== null &&
        !(args[1] instanceof Function)
      ) {
        clientRequest = fn.call(this, args[0], args[1], wrappedCallback);
      } else {
        clientRequest = fn.call(this, args[0], wrappedCallback);
      }
    } else {
      clientRequest = fn.call(this, options, wrappedCallback);
    }

    // Capture request body by hooking into write and end
    const requestBodyChunks: Buffer[] = [];

    const originalWrite = clientRequest.write.bind(clientRequest);
    const originalEnd = clientRequest.end.bind(clientRequest);

    clientRequest.write = function (
      chunk: unknown,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ): boolean {
      if (chunk) {
        const encoding: BufferEncoding =
          typeof encodingOrCallback === "string" ? encodingOrCallback : "utf-8";
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as string, encoding);
        requestBodyChunks.push(buffer);
      }

      if (typeof encodingOrCallback === "function") {
        return originalWrite(chunk as string, encodingOrCallback);
      }
      if (encodingOrCallback !== undefined) {
        return originalWrite(chunk as string, encodingOrCallback, callback);
      }
      return originalWrite(chunk as string, callback);
    };

    clientRequest.end = function (
      chunkOrCallback?: unknown,
      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void,
    ): http.ClientRequest {
      if (chunkOrCallback && typeof chunkOrCallback !== "function") {
        const encoding: BufferEncoding =
          typeof encodingOrCallback === "string" ? encodingOrCallback : "utf-8";
        const buffer = Buffer.isBuffer(chunkOrCallback)
          ? chunkOrCallback
          : Buffer.from(chunkOrCallback as string, encoding);
        requestBodyChunks.push(buffer);
      }

      // Emit request body after end is called
      const body = stringifyBody(requestBodyChunks);
      if (body) {
        interceptorEmitter.emit("request-body", {
          id: requestId,
          body,
        });
      }

      if (typeof chunkOrCallback === "function") {
        return originalEnd(chunkOrCallback);
      }
      if (typeof encodingOrCallback === "function") {
        return originalEnd(chunkOrCallback as string, encodingOrCallback);
      }
      if (encodingOrCallback !== undefined) {
        return originalEnd(
          chunkOrCallback as string,
          encodingOrCallback,
          callback,
        );
      }
      return originalEnd(chunkOrCallback as string, callback);
    };

    // ========================================================================
    // Socket Event Timing Capture
    // ========================================================================

    // Listen for socket events to capture timing breakdown
    clientRequest.on("socket", (socket) => {
      // DNS Lookup timing
      socket.on("lookup", () => {
        timing.dnsEnd = Date.now();
      });

      // TCP Connect timing
      socket.on("connect", () => {
        timing.tcpEnd = Date.now();
      });

      // For already-connected sockets (keep-alive), mark as immediate
      if (socket.connecting === false) {
        timing.dnsEnd = startTime;
        timing.tcpEnd = startTime;
      }
    });

    // TTFB - Time to First Byte (when response event fires)
    clientRequest.on("response", () => {
      timing.ttfbEnd = Date.now();
    });

    // Handle request errors
    clientRequest.on("error", (error: Error) => {
      const duration = Date.now() - startTime;
      interceptorEmitter.emit("request-error", {
        id: requestId,
        error: error.message,
        duration,
      });
    });

    return clientRequest;
  } as typeof http.request;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Start intercepting HTTP/HTTPS requests
 */
export function startInterceptor(): void {
  if (isIntercepting) {
    return;
  }

  // Store originals
  originalHttpRequest = http.request;
  originalHttpsRequest = https.request;
  originalHttpGet = http.get;
  originalHttpsGet = https.get;

  // Patch request functions
  http.request = createInterceptor(originalHttpRequest, "http");
  https.request = createInterceptor(originalHttpsRequest, "https");

  // Patch get functions (they're just convenience wrappers)
  http.get = function (this: unknown, ...args: unknown[]): http.ClientRequest {
    const req = (http.request as Function).apply(this, args);
    req.end();
    return req;
  } as typeof http.get;

  https.get = function (this: unknown, ...args: unknown[]): http.ClientRequest {
    const req = (https.request as Function).apply(this, args);
    req.end();
    return req;
  } as typeof https.get;

  isIntercepting = true;
}

/**
 * Stop intercepting and restore original functions
 */
export function stopInterceptor(): void {
  if (!isIntercepting) {
    return;
  }

  if (originalHttpRequest) {
    http.request = originalHttpRequest;
    originalHttpRequest = null;
  }

  if (originalHttpsRequest) {
    https.request = originalHttpsRequest;
    originalHttpsRequest = null;
  }

  if (originalHttpGet) {
    http.get = originalHttpGet;
    originalHttpGet = null;
  }

  if (originalHttpsGet) {
    https.get = originalHttpsGet;
    originalHttpsGet = null;
  }

  isIntercepting = false;
}

/**
 * Check if interceptor is currently active
 */
export function isInterceptorActive(): boolean {
  return isIntercepting;
}
