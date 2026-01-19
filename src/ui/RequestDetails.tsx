/**
 * Request Details Component
 *
 * Detail panel showing headers, request body, and response body with tabs.
 * Supports expanded mode for viewing full content with scrolling.
 */

import React, { useMemo } from "react";
import { Box, Text } from "ink";
import type {
  RequestLog,
  RequestStatus,
  TimingBreakdown,
  SizeInfo,
} from "../store.js";
import prettyMs from "pretty-ms";

// ============================================================================
// Types
// ============================================================================

type DetailTab = "headers" | "body" | "response";

interface RequestDetailsProps {
  log: RequestLog | undefined;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  maxHeight: number;
  isExpanded?: boolean;
  scrollOffset?: number;
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

function formatJson(
  str: string,
  maxLines: number,
  scrollOffset: number = 0,
): { lines: string[]; totalLines: number } {
  if (!str) return { lines: ["(empty)"], totalLines: 1 };

  try {
    // Try to parse and pretty-print JSON
    const parsed = JSON.parse(str);
    const formatted = JSON.stringify(parsed, null, 2);
    const allLines = formatted.split("\n");
    const totalLines = allLines.length;

    // Apply scroll offset and limit
    const visibleLines = allLines.slice(scrollOffset, scrollOffset + maxLines);

    if (totalLines > maxLines && scrollOffset + maxLines < totalLines) {
      const remaining = totalLines - scrollOffset - maxLines;
      visibleLines[visibleLines.length - 1] =
        `... (${remaining} more lines, scroll with ↑↓)`;
    }

    return { lines: visibleLines, totalLines };
  } catch {
    // Not JSON, return as plain text
    const allLines = str.split("\n");
    const totalLines = allLines.length;

    const visibleLines = allLines.slice(scrollOffset, scrollOffset + maxLines);

    if (totalLines > maxLines && scrollOffset + maxLines < totalLines) {
      const remaining = totalLines - scrollOffset - maxLines;
      visibleLines[visibleLines.length - 1] =
        `... (${remaining} more lines, scroll with ↑↓)`;
    }

    return { lines: visibleLines, totalLines };
  }
}

function formatHeaders(
  headers: Record<string, string | string[] | undefined>,
): Array<{ key: string; value: string }> {
  return Object.entries(headers)
    .filter(([_, value]) => value !== undefined)
    .map(([key, value]) => ({
      key,
      value: Array.isArray(value) ? value.join(", ") : String(value),
    }));
}

// ============================================================================
// Timing Waterfall Component
// ============================================================================

interface TimingWaterfallProps {
  timing: TimingBreakdown;
  width?: number;
}

function TimingWaterfall({
  timing,
  width = 40,
}: TimingWaterfallProps): React.ReactElement {
  const total = timing.total || 1;

  // Calculate bar widths proportionally
  const dnsWidth = Math.max(1, Math.round((timing.dns / total) * width));
  const tcpWidth = Math.max(1, Math.round((timing.tcp / total) * width));
  const ttfbWidth = Math.max(1, Math.round((timing.ttfb / total) * width));
  const downloadWidth = Math.max(
    1,
    Math.round((timing.download / total) * width),
  );

  // Create bar characters
  const createBar = (w: number, char: string) => char.repeat(Math.max(0, w));

  // Timing data for display
  const timingData = [
    {
      label: "DNS",
      time: timing.dns,
      color: "blue" as const,
      bar: createBar(dnsWidth, "█"),
    },
    {
      label: "TCP",
      time: timing.tcp,
      color: "green" as const,
      bar: createBar(tcpWidth, "█"),
    },
    {
      label: "TTFB",
      time: timing.ttfb,
      color: "yellow" as const,
      bar: createBar(ttfbWidth, "█"),
    },
    {
      label: "Download",
      time: timing.download,
      color: "cyan" as const,
      bar: createBar(downloadWidth, "█"),
    },
  ];

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="magenta">
        ⏱️ Timing Breakdown
      </Text>
      <Box flexDirection="column" marginLeft={1} marginTop={1}>
        {timingData.map(({ label, time, color, bar }) => (
          <Box key={label}>
            <Text color="gray">{label.padEnd(9)}</Text>
            <Text color={color}>{bar}</Text>
            <Text dimColor> {time}ms</Text>
          </Box>
        ))}
        <Box marginTop={1}>
          <Text color="gray">Total </Text>
          <Text bold color="white">
            {timing.total}ms
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

// ============================================================================
// Size Info Component
// ============================================================================

interface SizeInfoDisplayProps {
  size: SizeInfo;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function SizeInfoDisplay({ size }: SizeInfoDisplayProps): React.ReactElement {
  const compression = size.encoding ? size.encoding.toUpperCase() : "none";
  const savings =
    size.transferred > 0 && size.resource > size.transferred
      ? Math.round((1 - size.transferred / size.resource) * 100)
      : 0;

  return (
    <Box flexDirection="column" marginY={1}>
      <Text bold color="blue">
        📦 Response Size
      </Text>
      <Box flexDirection="column" marginLeft={1} marginTop={1}>
        <Box>
          <Text color="gray">Transferred: </Text>
          <Text bold color="cyan">
            {formatBytes(size.transferred)}
          </Text>
          {size.encoding && <Text dimColor> ({compression})</Text>}
        </Box>
        <Box>
          <Text color="gray">Resource: </Text>
          <Text bold color="white">
            {formatBytes(size.resource)}
          </Text>
        </Box>
        {savings > 0 && (
          <Box>
            <Text color="gray">Compression: </Text>
            <Text bold color="green">
              {savings}% saved
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ============================================================================
// Tab Components
// ============================================================================

interface TabButtonProps {
  label: string;
  isActive: boolean;
  hotkey: string;
}

function TabButton({
  label,
  isActive,
  hotkey,
}: TabButtonProps): React.ReactElement {
  return (
    <Box marginRight={2}>
      <Text
        bold={isActive}
        color={isActive ? "cyan" : "gray"}
        inverse={isActive}
      >
        {" "}
        {hotkey}:{label}{" "}
      </Text>
    </Box>
  );
}

// ============================================================================
// Expand Indicator
// ============================================================================

interface ExpandIndicatorProps {
  isExpanded: boolean;
  totalLines: number;
  currentLine: number;
}

function ExpandIndicator({
  isExpanded,
  totalLines,
  currentLine,
}: ExpandIndicatorProps): React.ReactElement {
  return (
    <Box marginLeft={2}>
      <Text color={isExpanded ? "green" : "gray"} bold={isExpanded}>
        {isExpanded ? "◉ EXPANDED" : "○ e:expand"}
      </Text>
      {isExpanded && totalLines > 0 && (
        <Text dimColor>
          {" "}
          | Line {currentLine + 1}/{totalLines} | y:copy | e:collapse
        </Text>
      )}
      {!isExpanded && <Text dimColor> | y:copy</Text>}
    </Box>
  );
}

// ============================================================================
// Headers View
// ============================================================================

interface HeadersViewProps {
  log: RequestLog;
  maxLines: number;
  isExpanded: boolean;
  scrollOffset: number;
}

function HeadersView({
  log,
  maxLines,
  isExpanded,
  scrollOffset,
}: HeadersViewProps): React.ReactElement {
  const reqHeaders = formatHeaders(log.reqHeaders);
  const resHeaders = formatHeaders(log.resHeaders);

  const allHeaders = [
    { type: "title", content: "📤 Request Headers" },
    ...reqHeaders.map((h) => ({ type: "header", key: h.key, value: h.value })),
    { type: "spacer" },
    { type: "title", content: "📥 Response Headers" },
    ...resHeaders.map((h) => ({ type: "header", key: h.key, value: h.value })),
  ];

  const totalItems = allHeaders.length;
  const displayItems = isExpanded
    ? allHeaders.slice(scrollOffset, scrollOffset + maxLines - 1)
    : allHeaders.slice(0, maxLines - 1);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <ExpandIndicator
          isExpanded={isExpanded}
          totalLines={totalItems}
          currentLine={scrollOffset}
        />
      </Box>

      {displayItems.map((item, idx) => {
        if (item.type === "title") {
          return (
            <Box key={idx} marginTop={idx > 0 ? 1 : 0}>
              <Text bold color="cyan">
                {item.content}
              </Text>
            </Box>
          );
        }
        if (item.type === "spacer") {
          return <Box key={idx} height={1} />;
        }
        if (item.type === "header") {
          return (
            <Box key={idx} marginLeft={1}>
              <Text color="yellow">{item.key}: </Text>
              <Text wrap={isExpanded ? "wrap" : "truncate"}>{item.value}</Text>
            </Box>
          );
        }
        return null;
      })}

      {!isExpanded && totalItems > maxLines - 1 && (
        <Text dimColor marginTop={1}>
          ... ({totalItems - maxLines + 1} more items, press 'e' to expand)
        </Text>
      )}
    </Box>
  );
}

// ============================================================================
// Body View
// ============================================================================

interface BodyViewProps {
  log: RequestLog;
  maxLines: number;
  isExpanded: boolean;
  scrollOffset: number;
}

function BodyView({
  log,
  maxLines,
  isExpanded,
  scrollOffset,
}: BodyViewProps): React.ReactElement {
  const { lines: bodyLines, totalLines } = useMemo(
    () =>
      formatJson(
        log.reqBody,
        isExpanded ? maxLines - 3 : maxLines - 4,
        scrollOffset,
      ),
    [log.reqBody, maxLines, isExpanded, scrollOffset],
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📤 Request Body
        </Text>
        <ExpandIndicator
          isExpanded={isExpanded}
          totalLines={totalLines}
          currentLine={scrollOffset}
        />
      </Box>

      <Box flexDirection="column" marginLeft={1}>
        {bodyLines.map((line, i) => (
          <Text
            key={i}
            wrap={isExpanded ? "wrap" : "truncate"}
            color={line.startsWith("...") ? "gray" : "white"}
          >
            {line}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

// ============================================================================
// Response View
// ============================================================================

interface ResponseViewProps {
  log: RequestLog;
  maxLines: number;
  isExpanded: boolean;
  scrollOffset: number;
}

function ResponseView({
  log,
  maxLines,
  isExpanded,
  scrollOffset,
}: ResponseViewProps): React.ReactElement {
  const { lines: bodyLines, totalLines } = useMemo(
    () =>
      formatJson(
        log.resBody,
        isExpanded ? maxLines - 5 : maxLines - 6,
        scrollOffset,
      ),
    [log.resBody, maxLines, isExpanded, scrollOffset],
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Status line */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Status:{" "}
        </Text>
        <Text color={getStatusColor(log.status)} bold>
          {log.status === "PENDING"
            ? "Pending..."
            : log.status === "ERROR"
              ? "Error"
              : log.status}
        </Text>
        {log.duration > 0 && <Text dimColor> ({prettyMs(log.duration)})</Text>}
      </Box>

      {/* Timing Waterfall */}
      {log.timing && <TimingWaterfall timing={log.timing} />}

      {/* Size Info */}
      {log.size && <SizeInfoDisplay size={log.size} />}

      {/* Error message if present */}
      {log.error && (
        <Box marginBottom={1} flexDirection="column">
          <Text bold color="red">
            Error:{" "}
          </Text>
          <Text color="red">{log.error}</Text>
        </Box>
      )}

      {/* Response body */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📥 Response Body
        </Text>
        <ExpandIndicator
          isExpanded={isExpanded}
          totalLines={totalLines}
          currentLine={scrollOffset}
        />
      </Box>

      <Box flexDirection="column" marginLeft={1}>
        {log.status === "PENDING" ? (
          <Text dimColor>Waiting for response...</Text>
        ) : (
          bodyLines.map((line, i) => (
            <Text
              key={i}
              wrap={isExpanded ? "wrap" : "truncate"}
              color={line.startsWith("...") ? "gray" : "white"}
            >
              {line}
            </Text>
          ))
        )}
      </Box>
    </Box>
  );
}

// ============================================================================
// RequestDetails Component
// ============================================================================

export function RequestDetails({
  log,
  activeTab,
  onTabChange,
  maxHeight,
  isExpanded = false,
  scrollOffset = 0,
}: RequestDetailsProps): React.ReactElement {
  if (!log) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        height={maxHeight}
        paddingX={2}
      >
        <Text dimColor>Select a request to view details</Text>
      </Box>
    );
  }

  const contentHeight = maxHeight - 4; // Account for header and tabs

  return (
    <Box flexDirection="column" height={maxHeight}>
      {/* URL Header */}
      <Box paddingX={1} borderBottom borderColor="gray">
        <Text bold color="white">
          {log.method}{" "}
        </Text>
        <Text color="cyan" wrap="truncate">
          {log.url}
        </Text>
      </Box>

      {/* Tab Bar */}
      <Box paddingX={1} paddingY={0} borderBottom borderColor="gray">
        <TabButton
          label="Headers"
          isActive={activeTab === "headers"}
          hotkey="1"
        />
        <TabButton label="Body" isActive={activeTab === "body"} hotkey="2" />
        <TabButton
          label="Response"
          isActive={activeTab === "response"}
          hotkey="3"
        />
      </Box>

      {/* Tab Content */}
      <Box flexGrow={1} overflow="hidden">
        {activeTab === "headers" && (
          <HeadersView
            log={log}
            maxLines={contentHeight}
            isExpanded={isExpanded}
            scrollOffset={scrollOffset}
          />
        )}
        {activeTab === "body" && (
          <BodyView
            log={log}
            maxLines={contentHeight}
            isExpanded={isExpanded}
            scrollOffset={scrollOffset}
          />
        )}
        {activeTab === "response" && (
          <ResponseView
            log={log}
            maxLines={contentHeight}
            isExpanded={isExpanded}
            scrollOffset={scrollOffset}
          />
        )}
      </Box>
    </Box>
  );
}
