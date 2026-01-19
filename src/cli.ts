#!/usr/bin/env node

/**
 * CLI: Separate Terminal Viewer
 */

import { renderUI } from "./index.js";
import { RemoteStore, connectToIpc } from "./ipc.js";

const args = process.argv.slice(2);

const showHelp = args.includes("--help") || args.includes("-h");
if (showHelp) {
  console.log(
    [
      "node-network-tab",
      "",
      "Usage:",
      "  node-network-tab            Open viewer and connect to running app",
      "  node-network-tab --connect  Same as above",
      "  node-network-tab --help     Show help",
      "",
      "Notes:",
      "  Start your app with: import 'node-network-tab/start'",
      "  Then open a second terminal and run: npx node-network-tab",
    ].join("\n"),
  );
  process.exit(0);
}

const remoteStore = new RemoteStore();

let connection: ReturnType<typeof connectToIpc> | null = null;

try {
  connection = connectToIpc({
    onLogs: (logs) => remoteStore.setLogs(logs),
    onError: (error) => {
      console.error(`[node-network-tab] ${error.message}`);
      process.exit(1);
    },
  });
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[node-network-tab] ${message}`);
  process.exit(1);
}

renderUI({
  store: remoteStore,
  onReplay: (log) => connection?.sendReplay(log),
});
