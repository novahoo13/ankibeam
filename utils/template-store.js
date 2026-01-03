/**
 * @fileoverview テンプレートストア管理モジュール
 *
 * このモジュールは解析テンプレートライブラリの管理を担当し、以下の機能を提供する:
 * - テンプレートのCRUD操作(作成、読取、更新、削除)
 * - デフォルトテンプレートの設定と取得
 * - アクティブテンプレートの設定と取得
 * - テンプレート一覧の取得とソート
 *
 * テンプレートライブラリの構造:
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
 * 空のテンプレートライブラリ構造を構築
 * @returns {Object} デフォルトのテンプレートライブラリ構造
 */
function buildEmptyTemplateLibrary() {
  return {
    version: 1,
    defaultTemplateId: null,
    templates: {},
  };
}

/**
 * 設定オブジェクトからテンプレートライブラリを読み込む
 * 存在しない場合は空のライブラリを返す
 * @param {Object} config - 設定オブジェクト
 * @returns {Object} テンプレートライブラリ
 */
export function loadTemplateLibrary(config) {
  if (!config || typeof config !== "object") {
    return buildEmptyTemplateLibrary();
  }

  const library = config.templateLibrary;

  // テンプレートライブラリが存在しない場合
  if (!library || typeof library !== "object") {
    return buildEmptyTemplateLibrary();
  }

  // 基本構造を検証して返却
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
 * テンプレートIDによりテンプレートを取得
 * @param {Object} config - 設定オブジェクト
 * @param {string} templateId - テンプレートID
 * @returns {Object|null} テンプレートオブジェクト、存在しない場合はnull
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
 * 一意なテンプレートIDを生成
 * @returns {string} "tpl_" + タイムスタンプ形式のID
 */
function generateTemplateId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 現在のISO 8601形式のタイムスタンプを取得
 * @returns {string} ISO 8601形式のタイムスタンプ
 */
function getCurrentTimestamp() {
  return new Date().toISOString();
}

/**
 * テンプレートオブジェクトを正規化
 * 必須フィールドの検証とデフォルト値の設定を行う
 * @param {Object} template - テンプレートオブジェクト
 * @param {boolean} isNew - 新規作成かどうか
 * @returns {Object} 正規化されたテンプレート
 */
function normalizeTemplate(template, isNew = false) {
  if (!template || typeof template !== "object") {
    throw new Error("テンプレートオブジェクトが無効です");
  }

  // 必須フィールドの検証
  if (!template.name || typeof template.name !== "string" || !template.name.trim()) {
    throw new Error("テンプレート名は必須です");
  }

  if (!template.deckName || typeof template.deckName !== "string") {
    throw new Error("デッキ名は必須です");
  }

  if (!template.modelName || typeof template.modelName !== "string") {
    throw new Error("モデル名は必須です");
  }

  if (!Array.isArray(template.fields) || template.fields.length === 0) {
    throw new Error("少なくとも1つのフィールドが必要です");
  }

  const now = getCurrentTimestamp();

  const normalized = {
    id: isNew ? generateTemplateId() : template.id,
    name: template.name.trim(),
    description: typeof template.description === "string" ? template.description.trim() : "",
    deckName: template.deckName.trim(),
    modelName: template.modelName.trim(),
    modelId: typeof template.modelId === "number" ? template.modelId : null,
    fields: normalizeTemplateFields(template.fields),
    prompt: typeof template.prompt === "string" ? template.prompt : "",
    createdAt: isNew ? now : (template.createdAt || now),
    updatedAt: now,
  };

  return normalized;
}

/**
 * テンプレートのフィールド配列を正規化
 * 各フィールドの必須項目を検証し、order順にソートする
 * @param {Array} fields - フィールド配列
 * @returns {Array} 正規化されたフィールド配列
 */
export function normalizeTemplateFields(fields) {
  if (!Array.isArray(fields)) {
    return [];
  }

  const normalized = fields.map((field, index) => {
    if (!field || typeof field !== "object") {
      throw new Error(`フィールド[${index}]が無効です`);
    }

    if (!field.name || typeof field.name !== "string") {
      throw new Error(`フィールド[${index}]の名前が無効です`);
    }

    return {
      name: field.name.trim(),
      label: typeof field.label === "string" ? field.label.trim() : field.name.trim(),
      parseInstruction: typeof field.parseInstruction === "string" ? field.parseInstruction.trim() : "",
      order: typeof field.order === "number" ? field.order : index,
      isRequired: typeof field.isRequired === "boolean" ? field.isRequired : false,
      aiStrategy: field.aiStrategy === "manual" ? "manual" : "auto",
    };
  });

  // order順にソート
  normalized.sort((a, b) => a.order - b.order);

  return normalized;
}

/**
 * テンプレートを保存または更新
 * 新規作成の場合はIDとタイムスタンプを自動生成し、
 * ライブラリが空の場合は自動的にデフォルトテンプレートに設定する
 * @param {Object} config - 設定オブジェクト(直接変更される)
 * @param {Object} template - 保存するテンプレート
 * @returns {Object} 保存されたテンプレート
 */
export function saveTemplate(config, template) {
  if (!config || typeof config !== "object") {
    throw new Error("設定オブジェクトが無効です");
  }

  // テンプレートライブラリが存在しない場合は初期化
  if (!config.templateLibrary) {
    config.templateLibrary = buildEmptyTemplateLibrary();
  }

  const library = config.templateLibrary;
  const isNew = !template.id || !library.templates[template.id];

  // テンプレートを正規化
  const normalized = normalizeTemplate(template, isNew);

  // テンプレートを保存
  library.templates[normalized.id] = normalized;

  // ライブラリが空だった場合、このテンプレートをデフォルトに設定
  if (isNew && Object.keys(library.templates).length === 1) {
    library.defaultTemplateId = normalized.id;
  }

  return normalized;
}

/**
 * テンプレートを削除
 * デフォルトテンプレートまたはアクティブテンプレートの場合は自動的にクリアする
 * @param {Object} config - 設定オブジェクト(直接変更される)
 * @param {string} templateId - 削除するテンプレートID
 * @returns {boolean} 削除成功時true
 */
export function deleteTemplate(config, templateId) {
  if (!config || typeof config !== "object") {
    throw new Error("設定オブジェクトが無効です");
  }

  if (!templateId || typeof templateId !== "string") {
    throw new Error("テンプレートIDが無効です");
  }

  const library = loadTemplateLibrary(config);

  // テンプレートが存在しない場合
  if (!library.templates[templateId]) {
    return false;
  }

  // テンプレートを削除
  delete library.templates[templateId];

  // デフォルトテンプレートの場合はクリア
  if (library.defaultTemplateId === templateId) {
    library.defaultTemplateId = null;
  }

  // アクティブテンプレートの場合はクリア
  if (config.ui?.activeTemplateId === templateId) {
    if (!config.ui) {
      config.ui = {};
    }
    config.ui.activeTemplateId = null;
  }

  // ライブラリを更新
  config.templateLibrary = library;

  return true;
}

/**
 * デフォルトテンプレートを設定
 * @param {Object} config - 設定オブジェクト(直接変更される)
 * @param {string|null} templateId - テンプレートID、nullの場合はクリア
 * @returns {boolean} 設定成功時true
 */
export function setDefaultTemplate(config, templateId) {
  if (!config || typeof config !== "object") {
    throw new Error("設定オブジェクトが無効です");
  }

  // テンプレートライブラリが存在しない場合は初期化
  if (!config.templateLibrary) {
    config.templateLibrary = buildEmptyTemplateLibrary();
  }

  const library = config.templateLibrary;

  // nullの場合はクリア
  if (templateId === null) {
    library.defaultTemplateId = null;
    return true;
  }

  if (typeof templateId !== "string") {
    throw new Error("テンプレートIDが無効です");
  }

  // テンプレートが存在するか確認
  if (!library.templates[templateId]) {
    throw new Error(`テンプレートID "${templateId}" が見つかりません`);
  }

  library.defaultTemplateId = templateId;
  return true;
}

/**
 * アクティブテンプレートを設定
 * @param {Object} config - 設定オブジェクト(直接変更される)
 * @param {string|null} templateId - テンプレートID、nullの場合はクリア
 * @param {string} source - 変更元("popup"|"floating"|"options"等)
 * @returns {boolean} 設定成功時true
 */
export function setActiveTemplate(config, templateId, source = "unknown") {
  if (!config || typeof config !== "object") {
    throw new Error("設定オブジェクトが無効です");
  }

  // ui設定が存在しない場合は初期化
  if (!config.ui) {
    config.ui = {};
  }

  // nullの場合はクリア
  if (templateId === null) {
    config.ui.activeTemplateId = null;
    config.ui.templateSelectionSource = source;
    return true;
  }

  if (typeof templateId !== "string") {
    throw new Error("テンプレートIDが無効です");
  }

  const library = loadTemplateLibrary(config);

  // テンプレートが存在するか確認
  if (!library.templates[templateId]) {
    throw new Error(`テンプレートID "${templateId}" が見つかりません`);
  }

  config.ui.activeTemplateId = templateId;
  config.ui.templateSelectionSource = source;
  return true;
}

/**
 * テンプレート一覧を取得
 * updatedAtの降順(新しい順)でソートして返す
 * @param {Object} config - 設定オブジェクト
 * @returns {Array} テンプレート配列
 */
export function listTemplates(config) {
  const library = loadTemplateLibrary(config);
  const templates = Object.values(library.templates);

  // updatedAtの降順でソート
  templates.sort((a, b) => {
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  return templates;
}

/**
 * アクティブテンプレートを取得
 * activeTemplateIdが設定されている場合はそれを、
 * なければdefaultTemplateIdを使用する
 * @param {Object} config - 設定オブジェクト
 * @returns {Object|null} テンプレートオブジェクト、存在しない場合はnull
 */
export function getActiveTemplate(config) {
  if (!config || typeof config !== "object") {
    return null;
  }

  const library = loadTemplateLibrary(config);

  // アクティブテンプレートIDを取得
  const activeId = config.ui?.activeTemplateId;
  if (activeId && library.templates[activeId]) {
    return library.templates[activeId];
  }

  // デフォルトテンプレートIDを取得
  const defaultId = library.defaultTemplateId;
  if (defaultId && library.templates[defaultId]) {
    return library.templates[defaultId];
  }

  return null;
}

/**
 * デフォルトテンプレートを取得
 * @param {Object} config - 設定オブジェクト
 * @returns {Object|null} テンプレートオブジェクト、存在しない場合はnull
 */
export function getDefaultTemplate(config) {
  const library = loadTemplateLibrary(config);
  const defaultId = library.defaultTemplateId;

  if (!defaultId) {
    return null;
  }

  return library.templates[defaultId] || null;
}
