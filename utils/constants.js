/**
 * @fileoverview Application Constants
 *
 * This module centralizes all application-wide constants to avoid magic numbers
 * and hardcoded values scattered throughout the codebase.
 *
 * Categories:
 * - AnkiConnect configuration
 * - Storage keys
 * - UI constants
 */

// ============================================================================
// AnkiConnect Configuration
// ============================================================================

/**
 * Default URL for AnkiConnect API
 * @const {string}
 */
export const ANKI_CONNECT_DEFAULT_URL = "http://127.0.0.1:8765";

/**
 * AnkiConnect API version
 * @const {number}
 */
export const ANKI_CONNECT_VERSION = 6;

// ============================================================================
// Storage Keys
// ============================================================================

/**
 * Key for storing the main configuration object in chrome.storage
 * @const {string}
 */
export const CONFIG_STORAGE_KEY = "ankiWordAssistantConfig";

// ============================================================================
// UI Constants
// ============================================================================

/**
 * Floating panel dimensions and layout constants
 */
export const FLOATING_PANEL = Object.freeze({
	WIDTH: 360,
	MAX_HEIGHT: 500,
	GAP: 12,
	PADDING: 8,
});

/**
 * Floating panel state constants
 */
export const PANEL_STATE = Object.freeze({
	IDLE: "idle",
	LOADING: "loading",
	READY: "ready",
	ERROR: "error",
});

// ============================================================================
// AI Service Constants
// ============================================================================

/**
 * Default AI parsing configuration
 */
export const AI_DEFAULTS = Object.freeze({
	TEMPERATURE: 0.3,
	MAX_TOKENS: 2000,
	MAX_RETRIES: 2,
});

// ============================================================================
// Error Boundary Constants
// ============================================================================

/**
 * Error boundary configuration
 */
export const ERROR_BOUNDARY = Object.freeze({
	MAX_ERRORS: 5,
	RESET_INTERVAL_MS: 30000,
});
