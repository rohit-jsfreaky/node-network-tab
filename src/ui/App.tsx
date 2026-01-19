/**
 * Main App Component
 *
 * Split-pane layout with request list on the left and details on the right.
 * Includes smart filtering with fuzzy search, method, and status filtering.
 */

import React, { useState, useEffect, useMemo } from "react";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { store, type RequestLog } from "../store.js";
import { RequestList } from "./RequestList.js";
import { RequestDetails } from "./RequestDetails.js";
import { exec } from "node:child_process";
import { platform } from "node:os";

// ============================================================================
// Types
// ============================================================================

type DetailTab = "headers" | "body" | "response";

// ============================================================================
// Clipboard Helper
// ============================================================================

function copyToClipboard(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const os = platform();
    let cmd: string;

    if (os === "win32") {
      // Windows - use clip command
      cmd = "clip";
    } else if (os === "darwin") {
      // macOS - use pbcopy
      cmd = "pbcopy";
    } else {
      // Linux - try xclip or xsel
      cmd = "xclip -selection clipboard";
    }

    const child = exec(cmd, (error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });

    if (child.stdin) {
      child.stdin.write(text);
      child.stdin.end();
    }
  });
}

// ============================================================================
// Filter Helper
// ============================================================================

function filterLogs(logs: RequestLog[], query: string): RequestLog[] {
  if (!query.trim()) return logs;

  const lowerQuery = query.toLowerCase().trim();

  return logs.filter((log) => {
    // Check if query is a method filter (GET, POST, etc.)
    const methods = [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
    ];
    if (methods.includes(lowerQuery)) {
      return log.method.toLowerCase() === lowerQuery;
    }

    // Check if query is a status code filter (200, 404, 500, etc.)
    const statusNum = parseInt(lowerQuery, 10);
    if (!isNaN(statusNum) && lowerQuery === String(statusNum)) {
      if (typeof log.status === "number") {
        // Match exact status or status class (e.g., "2" matches 2xx, "20" matches 200-209)
        const statusStr = String(log.status);
        return statusStr.startsWith(lowerQuery);
      }
      return false;
    }

    // Check for status keywords
    if (lowerQuery === "pending") {
      return log.status === "PENDING";
    }
    if (lowerQuery === "error" || lowerQuery === "err") {
      return (
        log.status === "ERROR" ||
        (typeof log.status === "number" && log.status >= 400)
      );
    }
    if (lowerQuery === "success" || lowerQuery === "ok") {
      return (
        typeof log.status === "number" && log.status >= 200 && log.status < 300
      );
    }

    // Fuzzy search in URL, path, and host
    const searchableText =
      `${log.url} ${log.path} ${log.host} ${log.method}`.toLowerCase();

    // Simple fuzzy matching - check if all characters appear in order
    let searchIdx = 0;
    for (const char of lowerQuery) {
      const foundIdx = searchableText.indexOf(char, searchIdx);
      if (foundIdx === -1) return false;
      searchIdx = foundIdx + 1;
    }
    return true;
  });
}

// ============================================================================
// App Component
// ============================================================================

export function App(): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<DetailTab>("response");
  const [isExpanded, setIsExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [scrollOffset, setScrollOffset] = useState(0);

  // Filter state
  const [isFilterMode, setIsFilterMode] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");

  // Calculate dimensions
  const terminalWidth = stdout?.columns || 120;
  const terminalHeight = stdout?.rows || 30;
  const listWidth = Math.floor(terminalWidth * 0.35);
  const detailWidth = terminalWidth - listWidth - 3; // Account for borders

  // Subscribe to store updates
  useEffect(() => {
    const unsubscribe = store.subscribe((newLogs) => {
      setLogs(newLogs);
    });
    return unsubscribe;
  }, []);

  // Filter logs based on query
  const filteredLogs = useMemo(() => {
    return filterLogs(logs, filterQuery);
  }, [logs, filterQuery]);

  // Keep selection in bounds when filtered logs change
  useEffect(() => {
    if (selectedIndex >= filteredLogs.length && filteredLogs.length > 0) {
      setSelectedIndex(filteredLogs.length - 1);
    } else if (filteredLogs.length === 0) {
      setSelectedIndex(0);
    }
  }, [filteredLogs.length, selectedIndex]);

  // Reset scroll when changing selection or tab
  useEffect(() => {
    setScrollOffset(0);
  }, [selectedIndex, activeTab]);

  // Clear copy status after a delay
  useEffect(() => {
    if (copyStatus) {
      const timer = setTimeout(() => setCopyStatus(""), 2000);
      return () => clearTimeout(timer);
    }
  }, [copyStatus]);

  const selectedLog = filteredLogs[selectedIndex];

  // Get content for current tab (for copy functionality)
  const getCurrentTabContent = (): string => {
    if (!selectedLog) return "";

    switch (activeTab) {
      case "headers":
        const reqHeaders = Object.entries(selectedLog.reqHeaders)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\n");
        const resHeaders = Object.entries(selectedLog.resHeaders)
          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
          .join("\n");
        return `=== Request Headers ===\n${reqHeaders}\n\n=== Response Headers ===\n${resHeaders}`;
      case "body":
        try {
          return JSON.stringify(JSON.parse(selectedLog.reqBody), null, 2);
        } catch {
          return selectedLog.reqBody;
        }
      case "response":
        try {
          return JSON.stringify(JSON.parse(selectedLog.resBody), null, 2);
        } catch {
          return selectedLog.resBody;
        }
      default:
        return "";
    }
  };

  // Handle keyboard input for filter mode (separate hook)
  useInput(
    (input, key) => {
      if (key.escape) {
        setIsFilterMode(false);
        setFilterQuery("");
        return;
      }
      if (key.return) {
        setIsFilterMode(false);
        return;
      }
    },
    { isActive: isFilterMode },
  );

  // Handle keyboard input for normal mode
  useInput(
    (input, key) => {
      // Quit
      if (input === "q" || input === "Q") {
        exit();
        return;
      }

      // Open filter mode
      if (input === "/" || input === "f" || input === "F") {
        setIsFilterMode(true);
        return;
      }

      // Expand/Collapse toggle
      if (input === "e" || input === "E") {
        setIsExpanded((prev) => !prev);
        setScrollOffset(0);
        return;
      }

      // Copy to clipboard
      if (input === "y" || input === "Y") {
        const content = getCurrentTabContent();
        if (content) {
          copyToClipboard(content)
            .then(() => setCopyStatus("✓ Copied!"))
            .catch(() => setCopyStatus("✗ Copy failed"));
        }
        return;
      }

      // Scroll in expanded mode
      if (isExpanded) {
        if (key.upArrow || input === "k") {
          setScrollOffset((prev) => Math.max(0, prev - 1));
          return;
        } else if (key.downArrow || input === "j") {
          setScrollOffset((prev) => prev + 1);
          return;
        }
        // Page up/down in expanded mode
        if (key.pageUp) {
          setScrollOffset((prev) => Math.max(0, prev - 10));
          return;
        }
        if (key.pageDown) {
          setScrollOffset((prev) => prev + 10);
          return;
        }
      }

      // Navigation (only when not expanded)
      if (!isExpanded) {
        if (key.upArrow || input === "k") {
          setSelectedIndex((prev) => Math.max(0, prev - 1));
        } else if (key.downArrow || input === "j") {
          setSelectedIndex((prev) =>
            Math.min(filteredLogs.length - 1, prev + 1),
          );
        }
      }

      // Tab switching
      if (key.tab || input === "h" || input === "l") {
        setActiveTab((prev) => {
          const tabs: DetailTab[] = ["headers", "body", "response"];
          const currentIndex = tabs.indexOf(prev);
          if (key.shift || input === "h") {
            return tabs[(currentIndex - 1 + tabs.length) % tabs.length];
          }
          return tabs[(currentIndex + 1) % tabs.length];
        });
      }

      // Number keys for quick tab selection
      if (input === "1") setActiveTab("headers");
      if (input === "2") setActiveTab("body");
      if (input === "3") setActiveTab("response");

      // Clear logs
      if (input === "c" || input === "C") {
        store.clear();
        setSelectedIndex(0);
        setFilterQuery("");
      }
    },
    { isActive: !isFilterMode },
  );

  return (
    <Box flexDirection="column" height={terminalHeight - 1}>
      {/* Header */}
      <Box
        borderStyle="single"
        borderColor="cyan"
        paddingX={1}
        justifyContent="space-between"
      >
        <Text bold color="cyan">
          🔍 Node Network Tab
        </Text>
        <Box>
          {copyStatus && (
            <Text color="green" bold>
              {copyStatus}{" "}
            </Text>
          )}
          {filterQuery && (
            <Text color="yellow" bold>
              🔎 "{filterQuery}"{" "}
            </Text>
          )}
          <Text dimColor>
            {filteredLogs.length}/{logs.length} | /:filter | q:quit | e:expand |
            y:copy
          </Text>
        </Box>
      </Box>

      {/* Main Content */}
      <Box flexGrow={1} flexDirection="row">
        {/* Left Panel - Request List (hidden in expanded mode) */}
        {!isExpanded && (
          <Box
            width={listWidth}
            flexDirection="column"
            borderStyle="single"
            borderColor="gray"
          >
            <Box paddingX={1} borderBottom borderColor="gray">
              <Text bold color="white">
                Requests
              </Text>
              {filterQuery && <Text dimColor> (filtered)</Text>}
            </Box>
            <RequestList
              logs={filteredLogs}
              selectedIndex={selectedIndex}
              onSelect={setSelectedIndex}
              maxHeight={terminalHeight - (isFilterMode ? 8 : 6)}
              filterQuery={filterQuery}
            />
          </Box>
        )}

        {/* Right Panel - Request Details */}
        <Box
          width={isExpanded ? terminalWidth - 2 : detailWidth}
          flexDirection="column"
          borderStyle="single"
          borderColor={isExpanded ? "cyan" : "gray"}
        >
          <RequestDetails
            log={selectedLog}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            maxHeight={terminalHeight - (isFilterMode ? 8 : 6)}
            isExpanded={isExpanded}
            scrollOffset={scrollOffset}
          />
        </Box>
      </Box>

      {/* Filter Bar */}
      {isFilterMode && (
        <Box borderStyle="single" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">
            🔎 Filter:{" "}
          </Text>
          <TextInput
            value={filterQuery}
            onChange={setFilterQuery}
            placeholder="Type to filter (url, GET, POST, 200, 500, error...)"
          />
          <Text dimColor> | Enter:apply | Esc:clear</Text>
        </Box>
      )}

      {/* Filter hint when not in filter mode */}
      {!isFilterMode && filterQuery && (
        <Box paddingX={1}>
          <Text color="yellow">
            🔎 Filtered by "{filterQuery}" | Press / to edit | c to clear
          </Text>
        </Box>
      )}
    </Box>
  );
}
