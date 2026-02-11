/**
 * @fileoverview Template Store Management Module
 *
 * This module manages the template library for parsing templates, providing:
 * - CRUD operations for templates (Create, Read, Update, Delete)
 * - Default template setting and retrieval
 * - Active template setting and retrieval
 * - Template listing and sorting
 *
 * Template Library Structure:
 * {
 *   version: 1,
 *   defaultTemplateId: string|null,
 *   templates: {
 *     [templateId]: {
 *       id, name, description, deckName, modelName, modelId,
 *       fields: [{name, label, parseInstruction, order}],
 *       prompt, createdAt, updatedAt
 *     }
 *   }
 * }
 */

/**
 * Build an empty template library structure
 * @returns {Object} Default template library structure
 */
function buildEmptyTemplateLibrary() {
	return {
		version: 1,
		defaultTemplateId: null,
		templates: {},
	};
}

/**
 * Load template library from configuration object
 * Returns empty library if not present
 * @param {Object} config - Configuration object
 * @returns {Object} Template library
 */
export function loadTemplateLibrary(config) {
	if (!config || typeof config !== "object") {
		return buildEmptyTemplateLibrary();
	}

	const library = config.templateLibrary;

	// Template library does not exist
	if (!library || typeof library !== "object") {
		return buildEmptyTemplateLibrary();
	}

	// Validate and return basic structure
	return {
		version: typeof library.version === "number" ? library.version : 1,
		defaultTemplateId:
			typeof library.defaultTemplateId === "string"
				? library.defaultTemplateId
				: null,
		templates:
			library.templates && typeof library.templates === "object"
				? library.templates
				: {},
	};
}

/**
 * Get template by ID
 * @param {Object} config - Configuration object
 * @param {string} templateId - Template ID
 * @returns {Object|null} Template object, or null if not found
 */
export function getTemplateById(config, templateId) {
	if (!templateId || typeof templateId !== "string") {
		return null;
	}

	const library = loadTemplateLibrary(config);
	const template = library.templates[templateId];

	if (!template || typeof template !== "object") {
		return null;
	}

	return template;
}

/**
 * Generate a unique template ID
 * @returns {string} ID in "tpl_" + timestamp format
 */
function generateTemplateId() {
	return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current ISO 8601 formatted timestamp
 * @returns {string} ISO 8601 formatted timestamp
 */
function getCurrentTimestamp() {
	return new Date().toISOString();
}

/**
 * Normalize a template object
 * Validates required fields and sets default values
 * @param {Object} template - Template object
 * @param {boolean} isNew - Whether this is a new template
 * @returns {Object} Normalized template
 */
function normalizeTemplate(template, isNew = false) {
	if (!template || typeof template !== "object") {
		throw new Error("Template object is invalid");
	}

	// Validate required fields
	if (
		!template.name ||
		typeof template.name !== "string" ||
		!template.name.trim()
	) {
		throw new Error("Template name is required");
	}

	if (!template.deckName || typeof template.deckName !== "string") {
		throw new Error("Deck name is required");
	}

	if (!template.modelName || typeof template.modelName !== "string") {
		throw new Error("Model name is required");
	}

	if (!Array.isArray(template.fields) || template.fields.length === 0) {
		throw new Error("At least one field is required");
	}

	const now = getCurrentTimestamp();

	const normalized = {
		id: isNew ? generateTemplateId() : template.id,
		name: template.name.trim(),
		description:
			typeof template.description === "string"
				? template.description.trim()
				: "",
		deckName: template.deckName.trim(),
		modelName: template.modelName.trim(),
		modelId: typeof template.modelId === "number" ? template.modelId : null,
		fields: normalizeTemplateFields(template.fields),
		prompt: typeof template.prompt === "string" ? template.prompt : "",
		createdAt: isNew ? now : template.createdAt || now,
		updatedAt: now,
	};

	return normalized;
}

/**
 * Normalize template field array
 * Validates each field's required items and sorts by order
 * @param {Array} fields - Field array
 * @returns {Array} Normalized field array
 */
export function normalizeTemplateFields(fields) {
	if (!Array.isArray(fields)) {
		return [];
	}

	const normalized = fields.map((field, index) => {
		if (!field || typeof field !== "object") {
			throw new Error(`Field[${index}] is invalid`);
		}

		if (!field.name || typeof field.name !== "string") {
			throw new Error(`Field[${index}] name is invalid`);
		}

		return {
			name: field.name.trim(),
			label:
				typeof field.label === "string"
					? field.label.trim()
					: field.name.trim(),
			parseInstruction:
				typeof field.parseInstruction === "string"
					? field.parseInstruction.trim()
					: "",
			order: typeof field.order === "number" ? field.order : index,
			isRequired:
				typeof field.isRequired === "boolean" ? field.isRequired : false,
			aiStrategy: field.aiStrategy === "manual" ? "manual" : "auto",
		};
	});

	// Sort by order
	normalized.sort((a, b) => a.order - b.order);

	return normalized;
}

/**
 * Save or update a template
 * For new templates, ID and timestamp are auto-generated.
 * If the library is empty, the template is automatically set as default.
 * @param {Object} config - Configuration object (modified directly)
 * @param {Object} template - Template to save
 * @returns {Object} Saved template
 */
export function saveTemplate(config, template) {
	if (!config || typeof config !== "object") {
		throw new Error("Configuration object is invalid");
	}

	// Initialize template library if not present
	if (!config.templateLibrary) {
		config.templateLibrary = buildEmptyTemplateLibrary();
	}

	const library = config.templateLibrary;
	const isNew = !template.id || !library.templates[template.id];

	// Normalize template
	const normalized = normalizeTemplate(template, isNew);

	// Save template
	library.templates[normalized.id] = normalized;

	// If library was empty, set this template as default
	if (isNew && Object.keys(library.templates).length === 1) {
		library.defaultTemplateId = normalized.id;
	}

	return normalized;
}

/**
 * Delete a template
 * If it's the default or active template, it will be automatically cleared
 * @param {Object} config - Configuration object (modified directly)
 * @param {string} templateId - Template ID to delete
 * @returns {boolean} True if deletion was successful
 */
export function deleteTemplate(config, templateId) {
	if (!config || typeof config !== "object") {
		throw new Error("Configuration object is invalid");
	}

	if (!templateId || typeof templateId !== "string") {
		throw new Error("Template ID is invalid");
	}

	const library = loadTemplateLibrary(config);

	// Template does not exist
	if (!library.templates[templateId]) {
		return false;
	}

	// Delete template
	delete library.templates[templateId];

	// Clear if it's the default template
	if (library.defaultTemplateId === templateId) {
		library.defaultTemplateId = null;
	}

	// Clear if it's the active template
	if (config.ui?.activeTemplateId === templateId) {
		if (!config.ui) {
			config.ui = {};
		}
		config.ui.activeTemplateId = null;
	}

	// Update library
	config.templateLibrary = library;

	return true;
}

/**
 * Set the default template
 * @param {Object} config - Configuration object (modified directly)
 * @param {string|null} templateId - Template ID, or null to clear
 * @returns {boolean} True if setting was successful
 */
export function setDefaultTemplate(config, templateId) {
	if (!config || typeof config !== "object") {
		throw new Error("Configuration object is invalid");
	}

	// Initialize template library if not present
	if (!config.templateLibrary) {
		config.templateLibrary = buildEmptyTemplateLibrary();
	}

	const library = config.templateLibrary;

	// If null, clear the default
	if (templateId === null) {
		library.defaultTemplateId = null;
		return true;
	}

	if (typeof templateId !== "string") {
		throw new Error("Template ID is invalid");
	}

	// Verify template exists
	if (!library.templates[templateId]) {
		throw new Error(`Template ID "${templateId}" not found`);
	}

	library.defaultTemplateId = templateId;
	return true;
}

/**
 * Set the active template
 * @param {Object} config - Configuration object (modified directly)
 * @param {string|null} templateId - Template ID, or null to clear
 * @param {string} source - Source of change ("popup"|"floating"|"options", etc.)
 * @returns {boolean} True if setting was successful
 */
export function setActiveTemplate(config, templateId, source = "unknown") {
	if (!config || typeof config !== "object") {
		throw new Error("Configuration object is invalid");
	}

	// Initialize UI config if not present
	if (!config.ui) {
		config.ui = {};
	}

	// If null, clear the active template
	if (templateId === null) {
		config.ui.activeTemplateId = null;
		config.ui.templateSelectionSource = source;
		return true;
	}

	if (typeof templateId !== "string") {
		throw new Error("Template ID is invalid");
	}

	const library = loadTemplateLibrary(config);

	// Verify template exists
	if (!library.templates[templateId]) {
		throw new Error(`Template ID "${templateId}" not found`);
	}

	config.ui.activeTemplateId = templateId;
	config.ui.templateSelectionSource = source;
	return true;
}

/**
 * Get list of templates
 * Returns sorted by updatedAt in descending order (newest first)
 * @param {Object} config - Configuration object
 * @returns {Array} Template array
 */
export function listTemplates(config) {
	const library = loadTemplateLibrary(config);
	const templates = Object.values(library.templates);

	// Sort by updatedAt in descending order
	templates.sort((a, b) => {
		const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
		const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
		return timeB - timeA;
	});

	return templates;
}

/**
 * Get the active template
 * Uses activeTemplateId if set, otherwise uses defaultTemplateId
 * @param {Object} config - Configuration object
 * @returns {Object|null} Template object, or null if not found
 */
export function getActiveTemplate(config) {
	if (!config || typeof config !== "object") {
		return null;
	}

	const library = loadTemplateLibrary(config);

	// Get active template ID
	const activeId = config.ui?.activeTemplateId;
	if (activeId && library.templates[activeId]) {
		return library.templates[activeId];
	}

	// Get default template ID
	const defaultId = library.defaultTemplateId;
	if (defaultId && library.templates[defaultId]) {
		return library.templates[defaultId];
	}

	return null;
}

/**
 * Get the default template
 * @param {Object} config - Configuration object
 * @returns {Object|null} Template object, or null if not found
 */
export function getDefaultTemplate(config) {
	const library = loadTemplateLibrary(config);
	const defaultId = library.defaultTemplateId;

	if (!defaultId) {
		return null;
	}

	return library.templates[defaultId] || null;
}
