/**
 * Request List Component
 *
 * Scrollable sidebar showing all captured requests with color-coded status.
 */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type { RequestLog, RequestStatus } from "../store.js";
import prettyMs from "pretty-ms";

// ============================================================================
// Types
// ============================================================================

interface RequestListProps {
  logs: RequestLog[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  maxHeight: number;
}

// ============================================================================
// Helper Functions
// ============================================================================

function getStatusColor(status: RequestStatus): string {
  if (status === "PENDING") return "yellow";
  if (status === "ERROR") return "red";
  if (typeof status === "number") {
    if (status >= 200 && status < 300) return "green";
    if (status >= 300 && status < 400) return "cyan";
    if (status >= 400 && status < 500) return "yellow";
    if (status >= 500) return "red";
  }
  return "gray";
}

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "green";
    case "POST":
      return "blue";
    case "PUT":
      return "yellow";
    case "PATCH":
      return "yellow";
    case "DELETE":
      return "red";
    case "HEAD":
      return "cyan";
    case "OPTIONS":
      return "magenta";
    default:
      return "white";
  }
}

function formatStatus(status: RequestStatus): string {
  if (status === "PENDING") return "...";
  if (status === "ERROR") return "ERR";
  return String(status);
}

function truncatePath(path: string, maxLength: number): string {
  if (path.length <= maxLength) return path;
  return path.slice(0, maxLength - 3) + "...";
}

// ============================================================================
// RequestListItem Component
// ============================================================================

interface RequestListItemProps {
  log: RequestLog;
  isSelected: boolean;
  width: number;
}

function RequestListItem({
  log,
  isSelected,
  width,
}: RequestListItemProps): React.ReactElement {
  const statusColor = getStatusColor(log.status);
  const methodColor = getMethodColor(log.method);

  // Calculate available space for path
  // Format: "[METHOD] /path... 200 123ms"
  const methodLength = log.method.length + 3; // [METHOD] + space
  const statusLength = formatStatus(log.status).length + 1;
  const durationLength =
    log.duration > 0 ? prettyMs(log.duration).length + 1 : 0;
  const pathMaxLength = Math.max(
    10,
    width - methodLength - statusLength - durationLength - 4,
  );

  return (
    <Box paddingX={1}>
      <Box width={width - 2}>
        {/* Selection indicator */}
        <Text color={isSelected ? "cyan" : "gray"}>
          {isSelected ? "▶ " : "  "}
        </Text>

        {/* Method */}
        <Text color={methodColor} bold>
          {log.method.padEnd(7)}
        </Text>

        {/* Path */}
        <Text color={isSelected ? "white" : "gray"} wrap="truncate">
          {truncatePath(log.path, pathMaxLength)}
        </Text>

        {/* Spacer */}
        <Box flexGrow={1} />

        {/* Status */}
        <Text color={statusColor} bold>
          {" "}
          {formatStatus(log.status)}
        </Text>

        {/* Duration */}
        {log.duration > 0 && <Text dimColor> {prettyMs(log.duration)}</Text>}
      </Box>
    </Box>
  );
}

// ============================================================================
// RequestList Component
// ============================================================================

export function RequestList({
  logs,
  selectedIndex,
  onSelect,
  maxHeight,
}: RequestListProps): React.ReactElement {
  // Calculate visible window based on selected index
  const visibleLogs = useMemo(() => {
    if (logs.length === 0) return [];

    const windowSize = Math.max(1, maxHeight - 2);
    let startIndex = 0;

    // Keep selected item in view
    if (selectedIndex >= windowSize) {
      startIndex = selectedIndex - windowSize + 1;
    }

    return logs.slice(startIndex, startIndex + windowSize).map((log, i) => ({
      log,
      originalIndex: startIndex + i,
    }));
  }, [logs, selectedIndex, maxHeight]);

  if (logs.length === 0) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height={maxHeight - 2}
        paddingX={1}
      >
        <Text dimColor>No requests yet.</Text>
        <Text dimColor>Make an HTTP request to see it here.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={maxHeight - 2} overflow="hidden">
      {visibleLogs.map(({ log, originalIndex }) => (
        <RequestListItem
          key={log.id}
          log={log}
          isSelected={originalIndex === selectedIndex}
          width={35}
        />
      ))}

      {/* Scroll indicator */}
      {logs.length > maxHeight - 2 && (
        <Box paddingX={1} marginTop={0}>
          <Text dimColor>
            {selectedIndex + 1}/{logs.length}
          </Text>
        </Box>
      )}
    </Box>
  );
}
