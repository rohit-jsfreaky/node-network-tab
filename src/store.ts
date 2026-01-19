/**
 * Request Log Store
 *
 * Singleton store that manages request logs with subscription-based updates.
 * Limits stored requests to prevent memory leaks.
 */

import {
  interceptorEmitter,
  type RequestStartEvent,
  type RequestBodyEvent,
  type ResponseHeadersEvent,
  type ResponseCompleteEvent,
  type RequestErrorEvent,
  type TimingUpdateEvent,
  type SizeUpdateEvent,
} from "./interceptor.js";

// ============================================================================
// Types
// ============================================================================

export type RequestStatus = number | "PENDING" | "ERROR";

export interface TimingBreakdown {
  /** Time from request start to DNS lookup complete (ms) */
  dns: number;
  /** Time from DNS complete to TCP connection established (ms) */
  tcp: number;
  /** Time from connection to first byte received (ms) */
  ttfb: number;
  /** Time from first byte to response complete (ms) */
  download: number;
  /** Total time (ms) */
  total: number;
}

export interface SizeInfo {
  /** Transferred size (as received over network, possibly compressed) */
  transferred: number;
  /** Resource size (uncompressed body size) */
  resource: number;
  /** Compression encoding (gzip, br, deflate, or null if none) */
  encoding: string | null;
}

export interface RequestLog {
  id: string;
  url: string;
  method: string;
  protocol: "http" | "https";
  host: string;
  path: string;
  status: RequestStatus;
  duration: number;
  startTime: number;
  reqHeaders: Record<string, string | string[] | undefined>;
  reqBody: string;
  resHeaders: Record<string, string | string[] | undefined>;
  resBody: string;
  error?: string;
  timing?: TimingBreakdown;
  size?: SizeInfo;
}

export type StoreListener = (logs: RequestLog[]) => void;

// ============================================================================
// Constants
// ============================================================================

const MAX_LOGS = 50;

// ============================================================================
// Store Implementation
// ============================================================================

class RequestStore {
  private logs: Map<string, RequestLog> = new Map();
  private orderedIds: string[] = [];
  private listeners: Set<StoreListener> = new Set();
  private isListening = false;

  /**
   * Get all logs as an array (most recent first)
   */
  getLogs(): RequestLog[] {
    return this.orderedIds.map((id) => this.logs.get(id)!).filter(Boolean);
  }

  /**
   * Get a specific log by ID
   */
  getLog(id: string): RequestLog | undefined {
    return this.logs.get(id);
  }

  /**
   * Subscribe to store updates
   */
  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);

    // Start listening to interceptor events if not already
    if (!this.isListening) {
      this.attachInterceptorListeners();
    }

    // Immediately call with current state
    listener(this.getLogs());

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs.clear();
    this.orderedIds = [];
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const logs = this.getLogs();
    for (const listener of this.listeners) {
      try {
        listener(logs);
      } catch (error) {
        // Ignore listener errors
      }
    }
  }

  /**
   * Add a new request to the store
   */
  private addRequest(event: RequestStartEvent): void {
    const log: RequestLog = {
      id: event.id,
      url: event.url,
      method: event.method,
      protocol: event.protocol,
      host: event.host,
      path: event.path,
      status: "PENDING",
      duration: 0,
      startTime: event.startTime,
      reqHeaders: event.headers,
      reqBody: "",
      resHeaders: {},
      resBody: "",
    };

    this.logs.set(event.id, log);
    this.orderedIds.unshift(event.id); // Add to front (most recent first)

    // Enforce max limit
    while (this.orderedIds.length > MAX_LOGS) {
      const oldId = this.orderedIds.pop();
      if (oldId) {
        this.logs.delete(oldId);
      }
    }

    this.notifyListeners();
  }

  /**
   * Update request body
   */
  private updateRequestBody(event: RequestBodyEvent): void {
    const log = this.logs.get(event.id);
    if (log) {
      log.reqBody = event.body;
      this.notifyListeners();
    }
  }

  /**
   * Update response headers
   */
  private updateResponseHeaders(event: ResponseHeadersEvent): void {
    const log = this.logs.get(event.id);
    if (log) {
      log.status = event.statusCode;
      log.resHeaders = event.headers;
      this.notifyListeners();
    }
  }

  /**
   * Complete the response
   */
  private completeResponse(event: ResponseCompleteEvent): void {
    const log = this.logs.get(event.id);
    if (log) {
      log.resBody = event.body;
      log.duration = event.duration;
      this.notifyListeners();
    }
  }

  /**
   * Handle request error
   */
  private handleError(event: RequestErrorEvent): void {
    const log = this.logs.get(event.id);
    if (log) {
      log.status = "ERROR";
      log.error = event.error;
      log.duration = event.duration;
      this.notifyListeners();
    }
  }

  /**
   * Update timing breakdown
   */
  private updateTiming(event: TimingUpdateEvent): void {
    const log = this.logs.get(event.id);
    if (log) {
      log.timing = {
        dns: event.dns,
        tcp: event.tcp,
        ttfb: event.ttfb,
        download: event.download,
        total: event.total,
      };
      this.notifyListeners();
    }
  }

  /**
   * Update size info
   */
  private updateSize(event: SizeUpdateEvent): void {
    const log = this.logs.get(event.id);
    if (log) {
      log.size = {
        transferred: event.transferred,
        resource: event.resource,
        encoding: event.encoding,
      };
      this.notifyListeners();
    }
  }

  /**
   * Attach listeners to the interceptor
   */
  private attachInterceptorListeners(): void {
    if (this.isListening) return;

    interceptorEmitter.on("request-start", (event) => {
      this.addRequest(event);
    });

    interceptorEmitter.on("request-body", (event) => {
      this.updateRequestBody(event);
    });

    interceptorEmitter.on("response-headers", (event) => {
      this.updateResponseHeaders(event);
    });

    interceptorEmitter.on("response-complete", (event) => {
      this.completeResponse(event);
    });

    interceptorEmitter.on("request-error", (event) => {
      this.handleError(event);
    });

    interceptorEmitter.on("timing-update", (event) => {
      this.updateTiming(event);
    });

    interceptorEmitter.on("size-update", (event) => {
      this.updateSize(event);
    });

    this.isListening = true;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const store = new RequestStore();

/**
 * Get the store instance
 */
export function getStore(): RequestStore {
  return store;
}
