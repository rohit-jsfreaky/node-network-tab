/**
 * IPC Server + Client helpers for separate-terminal UI.
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { store, type RequestLog, type StoreListener } from "./store.js";
import { replayRequest } from "./replay.js";

// ============================================================================
// Types
// ============================================================================

interface IpcInfo {
  pid: number;
  port: number;
  createdAt: number;
}

interface ServerMessageInit {
  type: "init";
  logs: RequestLog[];
}

interface ServerMessageUpdate {
  type: "update";
  logs: RequestLog[];
}

interface ClientMessageReplay {
  type: "replay";
  log: RequestLog;
}

type ServerMessage = ServerMessageInit | ServerMessageUpdate;

type ClientMessage = ClientMessageReplay;

export interface ViewerConnection {
  sendReplay: (log: RequestLog) => void;
  close: () => void;
}

export interface ConnectOptions {
  onLogs: (logs: RequestLog[]) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
}

// ============================================================================
// Utilities
// ============================================================================

const IPC_FILENAME = "node-network-tab.json";

function getIpcInfoPath(): string {
  return path.join(os.tmpdir(), IPC_FILENAME);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function writeIpcInfo(info: IpcInfo): void {
  try {
    fs.writeFileSync(getIpcInfoPath(), JSON.stringify(info), "utf-8");
  } catch {
    // Ignore file write errors
  }
}

function readIpcInfo(): IpcInfo | null {
  try {
    const raw = fs.readFileSync(getIpcInfoPath(), "utf-8");
    const parsed = JSON.parse(raw) as IpcInfo;
    if (!parsed?.pid || !parsed?.port) return null;
    if (!isProcessAlive(parsed.pid)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function removeIpcInfoIfOwned(pid: number): void {
  try {
    const info = readIpcInfo();
    if (info && info.pid === pid) {
      fs.unlinkSync(getIpcInfoPath());
    }
  } catch {
    // Ignore cleanup errors
  }
}

function encodeMessage(message: ServerMessage | ClientMessage): string {
  return `${JSON.stringify(message)}\n`;
}

// ============================================================================
// IPC Server (app process)
// ============================================================================

export function startIpcServer(): { port: number; close: () => void } {
  const server = net.createServer();
  const sockets = new Set<net.Socket>();

  const broadcast = (message: ServerMessage) => {
    const payload = encodeMessage(message);
    for (const socket of sockets) {
      socket.write(payload);
    }
  };

  let unsubscribe: (() => void) | null = null;

  server.on("connection", (socket) => {
    sockets.add(socket);

    // Send initial state
    const initMessage: ServerMessageInit = {
      type: "init",
      logs: store.getLogs(),
    };
    socket.write(encodeMessage(initMessage));

    let buffer = "";
    socket.on("data", (data) => {
      buffer += data.toString();
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) {
          try {
            const message = JSON.parse(line) as ClientMessage;
            if (message.type === "replay" && message.log) {
              replayRequest(message.log);
            }
          } catch {
            // Ignore malformed messages
          }
        }
        index = buffer.indexOf("\n");
      }
    });

    socket.on("close", () => {
      sockets.delete(socket);
    });
    socket.on("error", () => {
      sockets.delete(socket);
    });
  });

  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    if (address && typeof address === "object") {
      const info: IpcInfo = {
        pid: process.pid,
        port: address.port,
        createdAt: Date.now(),
      };
      writeIpcInfo(info);
    }
  });

  // Subscribe to store updates (broadcast full snapshot)
  const listener: StoreListener = (logs) => {
    const updateMessage: ServerMessageUpdate = { type: "update", logs };
    broadcast(updateMessage);
  };
  unsubscribe = store.subscribe(listener);

  const close = () => {
    unsubscribe?.();
    for (const socket of sockets) {
      socket.destroy();
    }
    sockets.clear();
    server.close();
    removeIpcInfoIfOwned(process.pid);
  };

  // Cleanup on exit
  process.on("exit", close);
  process.on("SIGINT", () => {
    close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    close();
    process.exit(0);
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return { port, close };
}

// ============================================================================
// IPC Client (viewer process)
// ============================================================================

export function connectToIpc(options: ConnectOptions): ViewerConnection {
  const { onLogs, onError, onConnect } = options;
  const info = readIpcInfo();

  if (!info) {
    const error = new Error(
      "No running node-network-tab instance found. Start your app first.",
    );
    onError?.(error);
    throw error;
  }

  const socket = net.createConnection({
    host: "127.0.0.1",
    port: info.port,
  });

  socket.on("connect", () => {
    onConnect?.();
  });

  socket.on("error", (err) => {
    onError?.(err);
  });

  let buffer = "";
  socket.on("data", (data) => {
    buffer += data.toString();
    let index = buffer.indexOf("\n");
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          const message = JSON.parse(line) as ServerMessage;
          if (message.type === "init" || message.type === "update") {
            onLogs(message.logs);
          }
        } catch {
          // Ignore malformed messages
        }
      }
      index = buffer.indexOf("\n");
    }
  });

  const sendReplay = (log: RequestLog) => {
    const message: ClientMessageReplay = { type: "replay", log };
    socket.write(encodeMessage(message));
  };

  const close = () => {
    socket.end();
  };

  return { sendReplay, close };
}

// ============================================================================
// Remote Store (viewer process)
// ============================================================================

export class RemoteStore {
  private logs: RequestLog[] = [];
  private listeners: Set<StoreListener> = new Set();

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    listener(this.logs);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setLogs(logs: RequestLog[]): void {
    this.logs = logs;
    for (const listener of this.listeners) {
      try {
        listener(this.logs);
      } catch {
        // Ignore listener errors
      }
    }
  }
}
