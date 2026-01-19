# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-18

### Added
- Initial release
- HTTP/HTTPS request interception via monkey patching
- Interactive terminal UI (TUI) using Ink
- Split-pane layout with request list and details panel
- Color-coded HTTP methods and status codes
- Tabbed detail view (Headers, Body, Response)
- JSON pretty-printing for request/response bodies
- Keyboard navigation (vim-style j/k + arrow keys)
- Zero-config mode via `import 'node-network-tab/start'`
- Programmatic API with `startInterceptor()`/`stopInterceptor()`
- Production safety check (disabled when NODE_ENV=production)
- Memory-safe 50-request circular buffer
- Headless mode for non-TTY environments

## [1.1.2] - 2026-01-19

### Fixed
- Ensure README is recognized on npm via package metadata

## [1.1.1] - 2026-01-19

### Fixed
- Capture requests made via global fetch
- Reduce published package size by excluding sourcemaps

## [1.1.0] - 2026-01-19

### Added
- Separate terminal viewer (`npx node-network-tab`) with IPC-based log streaming
- Inline UI opt-in via `NODE_NETWORK_TAB_INLINE_UI=1`
- Optional headless console logging via `NODE_NETWORK_TAB_HEADLESS_LOGS=1`
