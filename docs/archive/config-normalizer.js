/**
 * @fileoverview Configuration Normalizer Module
 *
 * This module provides a unified configuration normalization function that can be
 * shared across different parts of the application (content scripts, popup, etc.).
 *
 * The normalization ensures all configuration fields exist with valid types and
 * reasonable default values, preventing runtime errors from missing or malformed data.
 */

/**
 * Default configuration values
 * @const {Object}
 */
const CONFIG_DEFAULTS = Object.freeze({
	ui: {
		enableFloatingAssistant: true,
		fieldDisplayMode: "auto",
		activeTemplateId: null,
		templateSelectionSource: null,
	},
	ankiConfig: {
		defaultDeck: "",
		defaultModel: "",
		modelFields: [],
		defaultTags: [],
	},
	promptTemplates: {
		promptTemplatesByModel: {},
		custom: "",
	},
	styleConfig: {
		fontSize: "14px",
		textAlign: "left",
		lineHeight: "1.4",
	},
	language: "zh-CN",
});

/**
 * Sanitize and clean a string array, removing invalid entries
 * @param {any} value - The value to process
 * @returns {string[]} Cleaned string array
 */
function sanitizeStringArray(value) {
	if (!Array.isArray(value)) {
		return [];
	}
	return value
		.map((entry) => (typeof entry === "string" ? entry.trim() : ""))
		.filter((entry) => entry.length > 0);
}

/**
 * Normalize UI configuration section
 * @param {Object} rawUi - Raw UI configuration
 * @returns {Object} Normalized UI configuration
 */
function normalizeUiConfig(rawUi) {
	const defaults = CONFIG_DEFAULTS.ui;

	if (!rawUi || typeof rawUi !== "object") {
		return { ...defaults };
	}

	const normalized = { ...defaults, ...rawUi };
	normalized.enableFloatingAssistant = Boolean(
		normalized.enableFloatingAssistant,
	);

	if (typeof normalized.fieldDisplayMode !== "string") {
		normalized.fieldDisplayMode = defaults.fieldDisplayMode;
	}

	if (
		normalized.activeTemplateId !== null &&
		typeof normalized.activeTemplateId !== "string"
	) {
		normalized.activeTemplateId = defaults.activeTemplateId;
	}

	return normalized;
}

/**
 * Normalize Anki configuration section
 * @param {Object} rawAnkiConfig - Raw Anki configuration
 * @returns {Object} Normalized Anki configuration
 */
function normalizeAnkiConfig(rawAnkiConfig) {
	const defaults = CONFIG_DEFAULTS.ankiConfig;

	if (!rawAnkiConfig || typeof rawAnkiConfig !== "object") {
		return { ...defaults };
	}

	const normalized = { ...defaults, ...rawAnkiConfig };
	normalized.modelFields = sanitizeStringArray(normalized.modelFields);
	normalized.defaultTags = sanitizeStringArray(normalized.defaultTags);

	return normalized;
}

/**
 * Normalize prompt templates configuration section
 * @param {Object} rawPromptTemplates - Raw prompt templates configuration
 * @returns {Object} Normalized prompt templates configuration
 */
function normalizePromptTemplates(rawPromptTemplates) {
	const defaults = CONFIG_DEFAULTS.promptTemplates;

	if (!rawPromptTemplates || typeof rawPromptTemplates !== "object") {
		return { ...defaults };
	}

	const normalized = { ...defaults, ...rawPromptTemplates };

	if (
		!normalized.promptTemplatesByModel ||
		typeof normalized.promptTemplatesByModel !== "object"
	) {
		normalized.promptTemplatesByModel = {};
	}

	if (typeof normalized.custom !== "string") {
		normalized.custom = defaults.custom;
	}

	return normalized;
}

/**
 * Normalize style configuration section
 * @param {Object} rawStyleConfig - Raw style configuration
 * @returns {Object} Normalized style configuration
 */
function normalizeStyleConfig(rawStyleConfig) {
	const defaults = CONFIG_DEFAULTS.styleConfig;

	if (!rawStyleConfig || typeof rawStyleConfig !== "object") {
		return { ...defaults };
	}

	return { ...defaults, ...rawStyleConfig };
}

/**
 * Normalize a raw configuration object ensuring all fields exist with valid types
 *
 * This function creates a defensive copy of the configuration and normalizes
 * each section to ensure all expected fields exist with appropriate defaults.
 *
 * @param {Object} rawConfig - Raw configuration object from storage or other sources
 * @returns {Object} Normalized configuration object with all required fields
 *
 * @example
 * const normalized = normalizeUserConfig(storedConfig);
 * // normalized.ui.enableFloatingAssistant is guaranteed to be a boolean
 * // normalized.ankiConfig.modelFields is guaranteed to be an array
 */
export function normalizeUserConfig(rawConfig) {
	if (!rawConfig || typeof rawConfig !== "object") {
		return {
			ui: { ...CONFIG_DEFAULTS.ui },
			ankiConfig: { ...CONFIG_DEFAULTS.ankiConfig },
			promptTemplates: { ...CONFIG_DEFAULTS.promptTemplates },
			styleConfig: { ...CONFIG_DEFAULTS.styleConfig },
			language: CONFIG_DEFAULTS.language,
		};
	}

	const normalized = { ...rawConfig };

	// Normalize each configuration section
	normalized.ui = normalizeUiConfig(rawConfig.ui);
	normalized.ankiConfig = normalizeAnkiConfig(rawConfig.ankiConfig);
	normalized.promptTemplates = normalizePromptTemplates(
		rawConfig.promptTemplates,
	);
	normalized.styleConfig = normalizeStyleConfig(rawConfig.styleConfig);

	// Normalize language setting
	if (typeof rawConfig.language === "string" && rawConfig.language.trim()) {
		normalized.language = rawConfig.language.trim();
	} else if (
		typeof normalized.language !== "string" ||
		!normalized.language.trim()
	) {
		normalized.language = CONFIG_DEFAULTS.language;
	}

	return normalized;
}

/**
 * Get the default configuration object
 * @returns {Object} Default configuration object
 */
export function getDefaultConfig() {
	return {
		ui: { ...CONFIG_DEFAULTS.ui },
		ankiConfig: { ...CONFIG_DEFAULTS.ankiConfig },
		promptTemplates: { ...CONFIG_DEFAULTS.promptTemplates },
		styleConfig: { ...CONFIG_DEFAULTS.styleConfig },
		language: CONFIG_DEFAULTS.language,
	};
}
