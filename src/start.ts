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
  startIpcServer,
} from "./index.js";

// ============================================================================
// Safety Check
// ============================================================================

const isDevelopment = process.env.NODE_ENV !== "production";
const mode = (process.env.NODE_NETWORK_TAB_MODE || "").toLowerCase();
const inlineUIEnabled =
  mode === "inline" ||
  process.env.NODE_NETWORK_TAB_INLINE_UI === "1" ||
  process.env.NODE_NETWORK_TAB_INLINE_UI === "true";
const headlessEnabled =
  mode === "headless" ||
  process.env.NODE_NETWORK_TAB_HEADLESS === "1" ||
  process.env.NODE_NETWORK_TAB_HEADLESS === "true";
const silentMode =
  mode === "silent" ||
  headlessEnabled ||
  process.env.NODE_NETWORK_TAB_SILENT === "1" ||
  process.env.NODE_NETWORK_TAB_SILENT === "true";
const headlessLogsEnabled =
  mode === "headless-logs" ||
  process.env.NODE_NETWORK_TAB_HEADLESS_LOGS === "1" ||
  process.env.NODE_NETWORK_TAB_HEADLESS_LOGS === "true";

if (!isDevelopment) {
  console.warn(
    "[node-network-tab] Running in production mode. " +
      "Network interception is disabled for safety. " +
      'Set NODE_ENV to something other than "production" to enable.',
  );
} else {
  // Start intercepting
  startInterceptor();

  // Start IPC server for external UI
  startIpcServer();

  if (inlineUIEnabled && process.stdout.isTTY) {
    // Small delay to let the app initialize first
    setImmediate(() => {
      renderUI();
    });
  } else if (!silentMode && (headlessLogsEnabled || !process.stdout.isTTY)) {
    // Optional headless logging mode
    console.log(
      "[node-network-tab] Running in headless mode (no inline UI).",
    );
    console.log(
      "[node-network-tab] Use `npx node-network-tab` to open the UI.",
    );

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
