/**
 * node-network-tab
 *
 * Chrome DevTools-style network inspector for Node.js terminals.
 *
 * @example
 * // Zero-config usage (recommended)
 * import 'node-network-tab/start';
 *
 * @example
 * // Programmatic usage
 * import { startInterceptor, renderUI } from 'node-network-tab';
 * startInterceptor();
 * renderUI();
 */

import React from "react";
import { render, type Instance } from "ink";
import { App } from "./ui/App.js";
import {
  startInterceptor,
  stopInterceptor,
  isInterceptorActive,
  interceptorEmitter,
} from "./interceptor.js";
import {
  store,
  getStore,
  type RequestLog,
  type RequestStatus,
} from "./store.js";

// ============================================================================
// UI Rendering
// ============================================================================

let inkInstance: Instance | null = null;

/**
 * Render the TUI dashboard.
 * Only works in TTY terminals.
 */
export function renderUI(): Instance | null {
  // Check if we're in a TTY
  if (!process.stdout.isTTY) {
    console.warn("[node-network-tab] Not a TTY, skipping UI rendering.");
    return null;
  }

  // Don't render multiple times
  if (inkInstance) {
    return inkInstance;
  }

  // Render the Ink app
  inkInstance = render(React.createElement(App));

  // Handle cleanup
  inkInstance.waitUntilExit().then(() => {
    stopInterceptor();
    inkInstance = null;
  });

  return inkInstance;
}

/**
 * Unmount the UI if it's running.
 */
export function unmountUI(): void {
  if (inkInstance) {
    inkInstance.unmount();
    inkInstance = null;
  }
}

// ============================================================================
// Cleanup Handlers
// ============================================================================

function setupCleanup(): void {
  const cleanup = () => {
    stopInterceptor();
    unmountUI();
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

// ============================================================================
// Exports
// ============================================================================

export {
  // Interceptor
  startInterceptor,
  stopInterceptor,
  isInterceptorActive,
  interceptorEmitter,

  // Store
  store,
  getStore,

  // Types
  type RequestLog,
  type RequestStatus,
};

export type {
  RequestStartEvent,
  RequestBodyEvent,
  ResponseHeadersEvent,
  ResponseCompleteEvent,
  RequestErrorEvent,
} from "./interceptor.js";

// Setup cleanup handlers when imported
setupCleanup();
