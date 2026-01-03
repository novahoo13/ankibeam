# Implementation Plan v2

Based on `docs/code-review-report-comprehensive-v2.md`, this plan outlines the phased development for the Anki Word Assistant.

## Phase 1: Hotfixes

### Task 1.1: Fix Prompt Engine Crash in `utils/prompt-engine.js`

- **Issue**: `hasContent` check uses `.trim()` on potentially non-string values (numbers, booleans).
- **Fix**: Cast values to string before trimming: `String(parsed[field]).trim()`.
- **Status**: Completed

### Task 1.2: Fix Zombie Field Problem in `content/content-main.js`

- **Issue**: `applyConfig` updates `currentConfig` even if `shouldRerender` is false (panel busy), leading to mismatch between UI (old config) and logic (new config).
- **Fix**: Introduce `pendingConfig`. Only update `currentConfig` when actually re-rendering. If busy, save to `pendingConfig` and apply later.
- **Status**: Completed

### Task 1.3: Remove Legacy Code in `content/floating-panel.js`

- **Issue**: `buildFieldLayout` contains dead code for legacy mode which is already blocked in `content-main.js`.
- **Fix**: Remove legacy support logic. Simplify `buildFieldLayout`.
- **Status**: Completed

## Phase 2: Refactor

### Task 2.1: Extract `AnkiService`

- **Goal**: Unify `handleAnkiWrite` logic from `popup.js` and `content-main.js`.
- **Action**: Create `services/anki-service.js`. Move validation, wrapping, and API calls there.
- **Status**: Completed

### Task 2.2: Reuse `ErrorBoundary`

- **Goal**: Move `ErrorBoundary` to `utils` and apply it to Content Script.
- **Action**: Extract `ErrorBoundary` class to `utils/error-boundary.js`. Refactor `popup.js` and `content-main.js` to use it.
- **Status**: Completed

## Phase 3: Architecture (Planned)

### Task 3.1: ConfigService

- **Goal**: Solve race conditions.
- **Status**: Completed
