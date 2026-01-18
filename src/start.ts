/**
 * Auto-Start Entry Point
 *
 * Zero-config activation of node-network-tab.
 * Simply import this module to start intercepting HTTP requests.
 *
 * @example
 * import 'node-network-tab/start';
 *
 * // All HTTP/HTTPS requests are now captured!
 * fetch('https://api.example.com/users');
 */

import {
  startInterceptor,
  renderUI,
  stopInterceptor,
  unmountUI,
} from "./index.js";

// ============================================================================
// Safety Check
// ============================================================================

const isDevelopment = process.env.NODE_ENV !== "production";

if (!isDevelopment) {
  console.warn(
    "[node-network-tab] Running in production mode. " +
      "Network interception is disabled for safety. " +
      'Set NODE_ENV to something other than "production" to enable.',
  );
} else {
  // Start intercepting
  startInterceptor();

  // Start UI if in TTY
  if (process.stdout.isTTY) {
    // Small delay to let the app initialize first
    setImmediate(() => {
      renderUI();
    });
  } else {
    // Headless mode - just log to console
    console.log(
      "[node-network-tab] Running in headless mode (no TTY detected).",
    );
    console.log(
      "[node-network-tab] HTTP requests are being intercepted but not displayed.",
    );

    // Import and subscribe to store for minimal logging
    import("./store.js").then(({ store }) => {
      store.subscribe((logs) => {
        const latest = logs[0];
        if (latest) {
          const status = latest.status === "PENDING" ? "..." : latest.status;
          console.log(
            `[network] ${latest.method} ${latest.path} → ${status}` +
              (latest.duration > 0 ? ` (${latest.duration}ms)` : ""),
          );
        }
      });
    });
  }
}

// ============================================================================
// Re-export for convenience
// ============================================================================

export {
  startInterceptor,
  stopInterceptor,
  renderUI,
  unmountUI,
} from "./index.js";
export { store, getStore } from "./store.js";
