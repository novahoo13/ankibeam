// options.js - オプション画面
// 目的: 設定の表示・保存、各種接続のテスト

import { saveConfig, loadConfig, getDefaultConfig } from '../utils/storage.js';
import { testConnection as testAnki, getDeckNames, getModelNames, getModelFieldNames } from '../utils/ankiconnect.js';
import { testConnection as testAi, getProvidersHealth, testCurrentProvider } from '../utils/ai-service.js';
import { loadPromptForModel, savePromptForModel } from '../utils/prompt-engine.js';

// APIキーの実値（DOMには伏せ字を表示）
let actualApiKeys = {
  google: '',
  openai: '',
  anthropic: ''
};

// 現在のモデルフィールド一覧
let currentModelFields = [];

// 現在の設定オブジェクト
let currentConfig = {};

const promptEditorState = {
  currentModel: '',
  lastSavedPrompt: ''
};

const API_KEY_PLACEHOLDER = '********';

document.addEventListener('DOMContentLoaded', () => {
  // Tab导航初始化
  initTabNavigation();
  
  // 設定のロードと表示
  loadAndDisplayConfig();

  // イベント登録
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('test-anki-btn').addEventListener('click', handleTestAnki);
  document.getElementById('refresh-anki-data').addEventListener('click', handleRefreshAnkiData);
  document.getElementById('default-model').addEventListener('change', handleModelChange);
  
  // AIプロバイダ関連
  document.getElementById('ai-provider').addEventListener('change', handleProviderChange);
  
  // APIキーの表示切替
  setupApiKeyInputs();
  
  // 各プロバイダ接続テストボタン
  setupTestProviderButtons();

  // Promptエディタの初期化
  setupPromptEditor();

  // 配置管理按钮
  document.getElementById('export-config-btn').addEventListener('click', handleExportConfiguration);
  document.getElementById('import-config-btn').addEventListener('click', handleImportConfigurationClick);
  document.getElementById('import-config-input').addEventListener('change', handleImportConfigurationFile);
  document.getElementById('reset-config-btn').addEventListener('click', handleResetConfiguration);

  // スタイルプレビュー
  document.getElementById('font-size-select').addEventListener('change', updateStylePreview);
  document.getElementById('text-align-select').addEventListener('change', updateStylePreview);
  document.getElementById('line-height-select').addEventListener('change', updateStylePreview);

  // 初始显示当前选中提供商状态
  updateCurrentProviderStatus();
});

/**
 * 各プロバイダ接続テストボタン
 */
function setupTestProviderButtons() {
  document.querySelectorAll('.test-provider-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const provider = e.target.getAttribute('data-provider');
      if (provider) {
        handleTestProvider(provider);
      }
    });
  });
}

/**
 * Promptエディタ関連の初期化
 */
function setupPromptEditor() {
  const promptTextarea = document.getElementById('custom-prompt-textarea');
  const fieldTagsList = document.getElementById('field-tags-list');
  const resetButton = document.getElementById('reset-prompt-btn');
  const resetGlobalButton = document.getElementById('reset-global-prompt-btn');

  if (promptTextarea) {
    promptTextarea.addEventListener('input', () => {
      updatePromptPreview();
      markPromptDirtyFlag();
    });
  }

  if (fieldTagsList) {
    fieldTagsList.addEventListener('click', handleFieldTagInsert);
  }

  if (resetButton) {
    resetButton.addEventListener('click', handleResetPromptTemplate);
  }

  if (resetGlobalButton) {
    resetGlobalButton.addEventListener('click', handleResetGlobalPromptTemplate);
  }

  hidePromptConfig();
  markPromptDirtyFlag(false);
}

/**
 * フィールドタグのクリックでプレースホルダを挿入
 * @param {MouseEvent} event - クリックイベント
 */
function handleFieldTagInsert(event) {
  const target = event.target;
  if (!target || !target.dataset.field) {
    return;
  }

  event.preventDefault();

  const promptTextarea = document.getElementById('custom-prompt-textarea');
  if (!promptTextarea || promptTextarea.disabled) {
    return;
  }

  const placeholder = `{{${target.dataset.field}}}`;
  const selectionStart = promptTextarea.selectionStart ?? promptTextarea.value.length;
  const selectionEnd = promptTextarea.selectionEnd ?? promptTextarea.value.length;

  const before = promptTextarea.value.slice(0, selectionStart);
  const after = promptTextarea.value.slice(selectionEnd);
  promptTextarea.value = `${before}${placeholder}${after}`;

  const cursorPosition = selectionStart + placeholder.length;
  promptTextarea.selectionStart = cursorPosition;
  promptTextarea.selectionEnd = cursorPosition;
  promptTextarea.focus();

  updatePromptPreview();
  markPromptDirtyFlag();
}

/**
 * モデル専用Promptをデフォルトに戻す
 */
function handleResetPromptTemplate() {
  const promptTextarea = document.getElementById('custom-prompt-textarea');
  if (!promptTextarea || promptTextarea.disabled) {
    return;
  }

  promptTextarea.value = getDefaultPromptTemplate();
  updatePromptPreview();
  markPromptDirtyFlag();
}

/**
 * グローバルPromptをリセット
 */
function handleResetGlobalPromptTemplate() {
  const globalTextarea = document.getElementById('custom-prompt');
  if (!globalTextarea) {
    return;
  }

  globalTextarea.value = getDefaultGlobalPromptTemplate();
}

/**
 * Prompt設定UIを表示
 * @param {string} modelName - モデル名
 * @param {string[]} fields - フィールド一覧
 */
function showPromptConfig(modelName, fields) {
  const promptContainer = document.getElementById('prompt-field-tags');
  const fieldTagsList = document.getElementById('field-tags-list');
  const promptTextarea = document.getElementById('custom-prompt-textarea');
  const preview = document.getElementById('prompt-preview-content');
  const currentModelLabel = document.getElementById('prompt-current-model');
  const resetButton = document.getElementById('reset-prompt-btn');
  const modelHint = document.getElementById('prompt-model-hint');

  if (!promptContainer || !fieldTagsList || !promptTextarea || !preview) {
    console.warn('Prompt設定要素が見つかりません');
    return;
  }

  promptEditorState.currentModel = modelName;

  if (currentModelLabel) {
    currentModelLabel.textContent = `当前模板：${modelName}`;
  }

  if (modelHint) {
    modelHint.textContent = '提示：保存设置后将在 popup 中使用此 Prompt。';
  }

  if (fields.length > 0) {
    promptContainer.style.display = 'block';
    fieldTagsList.innerHTML = fields
      .map((field) => `<button type="button" class="field-tag-btn" data-field="${field}">${field}</button>`)
      .join('');
  } else {
    promptContainer.style.display = 'none';
    fieldTagsList.innerHTML = '';
  }

  promptTextarea.disabled = false;
  const template = loadPromptForModel(modelName, currentConfig) || getDefaultPromptTemplate();
  promptTextarea.value = template;
  promptEditorState.lastSavedPrompt = template;

  if (resetButton) {
    resetButton.disabled = false;
  }

  updatePromptPreview();
  markPromptDirtyFlag(false);
}

/**
 * Prompt設定UIをリセット
 */
function hidePromptConfig() {
  const promptContainer = document.getElementById('prompt-field-tags');
  const fieldTagsList = document.getElementById('field-tags-list');
  const promptTextarea = document.getElementById('custom-prompt-textarea');
  const preview = document.getElementById('prompt-preview-content');
  const currentModelLabel = document.getElementById('prompt-current-model');
  const resetButton = document.getElementById('reset-prompt-btn');
  const modelHint = document.getElementById('prompt-model-hint');

  if (!promptContainer || !fieldTagsList || !promptTextarea || !preview) {
    console.warn('Prompt設定要素が見つかりません');
    return;
  }

  promptEditorState.currentModel = '';
  promptEditorState.lastSavedPrompt = '';

  if (currentModelLabel) {
    currentModelLabel.textContent = '当前模板：未选择';
  }

  if (modelHint) {
    modelHint.textContent = '请在「Anki 连接」面板选择要编辑的模型，随后在这里自定义 Prompt。';
  }

  promptContainer.style.display = 'none';
  fieldTagsList.innerHTML = '';
  promptTextarea.value = '';
  promptTextarea.disabled = true;

  if (resetButton) {
    resetButton.disabled = true;
  }

  preview.textContent = '请选择模板并编辑 Prompt 后，这里会显示预览效果';
  markPromptDirtyFlag(false);
}

/**
 * 加载并显示指定模型的Prompt模板
 * @param {string} modelName - 模型名称
 */
function loadAndDisplayPromptForModel(modelName) {
  if (!modelName) return;

  const promptTextarea = document.getElementById('custom-prompt-textarea');
  if (!promptTextarea) return;

  // 从配置中加载对应模型的prompt
  const savedPrompt = loadPromptForModel(modelName, currentConfig);

  // 如果没有保存的prompt，使用默认模板
  if (savedPrompt) {
    promptTextarea.value = savedPrompt;
  } else {
    // 使用默认模板
    promptTextarea.value = getDefaultPromptTemplate();
  }

  // 启用编辑器
  promptTextarea.disabled = false;

  // 启用重置按钮
  const resetButton = document.getElementById('reset-prompt-btn');
  if (resetButton) {
    resetButton.disabled = false;
  }

  // 更新预览
  updatePromptPreview();
  markPromptDirtyFlag(false);
}

/**
 * 获取默认Prompt模板
 * @returns {string} - 默认模板
 */
function getDefaultPromptTemplate() {
  return `# Role: 专业单词查询助手

请完成以下任务：
1. 查询单词/短语: "{{INPUT_TEXT}}"
2. 生成详细解析信息
3. 按以下JSON格式输出：
{{FIELD_SCHEMA}}

要求：
- 输出纯JSON格式，不包含任何解释文字
- 根据单词/短语的特点，填充相应字段
- 如果某个字段不适用，可以不输出该字段`;
}

/**
 * Promptの編集状態を表示
 * @param {boolean} [forced] - 強制表示/非表示
 */
function markPromptDirtyFlag(forced) {
  const flag = document.getElementById('prompt-dirty-flag');
  const promptTextarea = document.getElementById('custom-prompt-textarea');
  if (!flag || !promptTextarea) {
    return;
  }

  if (typeof forced === 'boolean') {
    flag.style.display = forced ? 'inline' : 'none';
    return;
  }

  const isDirty = promptTextarea.value !== promptEditorState.lastSavedPrompt;
  flag.style.display = isDirty ? 'inline' : 'none';
}

/**
 * モデル専用Promptのデフォルトテンプレート
 * @returns {string}
 */
/**
 * グローバルPromptのデフォルトテンプレート
 * @returns {string}
 */
function getDefaultGlobalPromptTemplate() {
  return '';
}

/**
 * Promptプレビューを更新
 */
function updatePromptPreview() {
  const promptTextarea = document.getElementById('custom-prompt-textarea');
  const preview = document.getElementById('prompt-preview-content');
  if (!promptTextarea || !preview) {
    return;
  }

  const template = promptTextarea.value;
  if (!template || !template.trim()) {
    preview.textContent = '请选择模板并编辑 Prompt 后，这里会显示预览效果';
    return;
  }

  if (!currentModelFields || currentModelFields.length === 0) {
    preview.textContent = template;
    return;
  }

  let rendered = template.replace(/\{\{INPUT_TEXT\}\}/g, '"示例词汇"');
  rendered = rendered.replace(/\{\{FIELD_SCHEMA\}\}/g, generatePreviewSchema(currentModelFields));
  rendered = rendered.replace(/\{\{AVAILABLE_FIELDS\}\}/g, currentModelFields.join(', '));

  currentModelFields.forEach((field) => {
    const pattern = new RegExp(`\\{\\{${escapeRegExp(field)}\\}\\}`, 'g');
    rendered = rendered.replace(pattern, `${field} 示例内容`);
  });

  preview.textContent = rendered;
}

/**
 * フィールド構造のプレビューJSONを生成
 * @param {string[]} fields - フィールド一覧
 * @returns {string}
 */
function generatePreviewSchema(fields) {
  const schema = {};
  fields.forEach((field) => {
    const lower = field.toLowerCase();
    if (lower.includes('word') || lower.includes('front')) {
      schema[field] = '单词本身';
    } else if (lower.includes('reading') || lower.includes('pronunciation')) {
      schema[field] = '读音或音标';
    } else if (lower.includes('meaning') || lower.includes('definition')) {
      schema[field] = '释义与解释';
    } else if (lower.includes('example') || lower.includes('sentence')) {
      schema[field] = '例句或用法';
    } else {
      schema[field] = `${field} 相关内容`;
    }
  });
  return JSON.stringify(schema, null, 2);
}

/**
 * 正規表現用に文字列をエスケープ
 * @param {string} value - 対象文字列
 * @returns {string}
 */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&");
}
/**
 * 設定ファイルをエクスポート
 */
async function handleExportConfiguration() {
  try {
    updateStatus('save-status', '正在导出配置...', 'loading');
    const baseConfig = currentConfig && Object.keys(currentConfig).length ? currentConfig : getDefaultConfig();
    const exportData = JSON.parse(JSON.stringify(baseConfig));
    exportData.version = exportData.version || '2.1';
    exportData.exportedAt = new Date().toISOString();

    if (exportData.aiConfig?.models) {
      Object.keys(exportData.aiConfig.models).forEach((provider) => {
        if (!exportData.aiConfig.models[provider]) {
          exportData.aiConfig.models[provider] = {};
        }
        exportData.aiConfig.models[provider].apiKey = '';
        exportData.aiConfig.models[provider].healthStatus = 'unknown';
      });
    }

    const timestamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const fileName = `anki-word-assistant-config-${timestamp}.json`;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);

    updateStatus('save-status', '配置导出成功', 'success');
  } catch (error) {
    console.error('設定エクスポートに失敗しました:', error);
    updateStatus('save-status', `配置导出失败: ${error.message}`, 'error');
  }
}

/**
 * インポートダイアログを開く
 */
function triggerImportDialog() {
  const fileInput = document.getElementById('import-config-input');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

/**
 * 設定ファイルをインポート
 * @param {Event} event - changeイベント
 */
async function handleImportConfiguration(event) {
  const fileInput = event?.target;
  const file = fileInput?.files && fileInput.files[0];
  if (!file) {
    return;
  }

  try {
    updateStatus('save-status', '正在导入配置...', 'loading');
    const text = await file.text();
    let importedConfig;
    try {
      importedConfig = JSON.parse(text);
    } catch (parseError) {
      throw new Error('配置文件不是有效的 JSON');
    }

    if (!importedConfig || typeof importedConfig !== 'object') {
      throw new Error('配置文件格式不正确');
    }

    if (!importedConfig.aiConfig) {
      throw new Error('配置文件缺少 aiConfig');
    }

    const baseConfig = getDefaultConfig();
    const mergedConfig = {
      ...baseConfig,
      ...importedConfig,
      aiConfig: {
        ...baseConfig.aiConfig,
        ...(importedConfig.aiConfig || {}),
        models: {
          ...baseConfig.aiConfig.models,
          ...(importedConfig.aiConfig?.models || {}),
        },
      },
      promptTemplates: {
        ...baseConfig.promptTemplates,
        ...(importedConfig.promptTemplates || {}),
      },
      ankiConfig: {
        ...baseConfig.ankiConfig,
        ...(importedConfig.ankiConfig || {}),
      },
      styleConfig: {
        ...baseConfig.styleConfig,
        ...(importedConfig.styleConfig || {}),
      },
      ui: {
        ...baseConfig.ui,
        ...(importedConfig.ui || {}),
      },
      language: importedConfig.language || baseConfig.language,
    };

    mergedConfig.aiConfig.fallbackOrder = importedConfig.aiConfig?.fallbackOrder || baseConfig.aiConfig.fallbackOrder;

    const mergedModelPrompts = {
      ...baseConfig.promptTemplates.promptTemplatesByModel,
      ...(importedConfig.promptTemplates?.promptTemplatesByModel || {}),
      ...(importedConfig.ankiConfig?.promptTemplatesByModel || {}), // 向后兼容旧版本
    };

    mergedConfig.promptTemplates.promptTemplatesByModel = { ...mergedModelPrompts };

    if (mergedConfig.aiConfig?.models) {
      Object.keys(mergedConfig.aiConfig.models).forEach((provider) => {
        const modelConfig = mergedConfig.aiConfig.models[provider] || {};
        mergedConfig.aiConfig.models[provider] = {
          ...modelConfig,
          apiKey: '',
          healthStatus: 'unknown',
        };
      });
    }

    mergedConfig.version = importedConfig.version || baseConfig.version;
    delete mergedConfig.exportDate;
    delete mergedConfig.exportedAt;

    await saveConfig(mergedConfig);
    currentConfig = mergedConfig;
    updateStatus('save-status', '配置导入成功，请重新配置 API 密钥', 'success');
    setTimeout(() => window.location.reload(), 1000);
  } catch (error) {
    console.error('設定インポートに失敗しました:', error);
    updateStatus('save-status', `配置导入失败: ${error.message}`, 'error');
  } finally {
    if (event?.target) {
      event.target.value = '';
    }
  }
}

/**
 * 設定をデフォルト状態にリセット
 */
async function handleResetConfiguration() {
  if (!confirm('确定要重置所有配置吗？此操作不可撤销。')) {
    return;
  }

  try {
    updateStatus('save-status', '正在重置配置...', 'loading');
    const defaultConfig = getDefaultConfig();
    await saveConfig(defaultConfig);
    currentConfig = defaultConfig;
    updateStatus('save-status', '配置已重置为默认值', 'success');
    setTimeout(() => window.location.reload(), 800);
  } catch (error) {
    console.error('設定リセットに失敗しました:', error);
    updateStatus('save-status', `重置配置失败: ${error.message}`, 'error');
  }
}

/**
 * APIキーの表示/非表示 切替
 * @param {Event} e - イベント
 */
function setupApiKeyInputs() {
  document.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
    btn.addEventListener('click', handleToggleVisibility);
  });

  Object.keys(actualApiKeys).forEach(provider => {
    const input = document.getElementById(`${provider}-api-key`);
    if (input) {
      input.addEventListener('input', (e) => {
        // プレースホルダー以外が入力されたら実値を更新
        if (e.target.value !== API_KEY_PLACEHOLDER) {
          actualApiKeys[provider] = e.target.value;
        }
      });
    }
  });
}

/**
 * APIキーの表示/非表示 切替
 * @param {Event} e - イベント
 */
function handleToggleVisibility(e) {
  const targetId = e.target.getAttribute('data-target');
  const input = document.getElementById(targetId);
  const provider = targetId.replace('-api-key', '');

  if (input) {
    if (input.type === 'password') {
      input.type = 'text';
      input.value = actualApiKeys[provider];
      e.target.textContent = '隐藏';
    } else {
      input.type = 'password';
      input.value = API_KEY_PLACEHOLDER;
      e.target.textContent = '显示';
    }
  }
}

/**
 * 設定のロードと表示
 */
async function loadAndDisplayConfig() {
  const config = await loadConfig();
  currentConfig = config;

  // AI設定
  const aiConfig = config?.aiConfig || {};
  
  // デフォルトプロバイダ
  document.getElementById('ai-provider').value = aiConfig.provider || 'google';
  
  // 各プロバイダ設定
  const models = aiConfig.models || {};
  
  // 供給者ごとの入力反映
  const loadProviderConfig = (provider) => {
    const providerConfig = models[provider] || {};
    const input = document.getElementById(`${provider}-api-key`);
    if (providerConfig.apiKey) {
      actualApiKeys[provider] = providerConfig.apiKey;
      input.value = API_KEY_PLACEHOLDER;
    }
    const modelInput = document.getElementById(`${provider}-model-name`);
    if (modelInput) modelInput.value = providerConfig.modelName || '';
    const urlInput = document.getElementById(`${provider}-api-url`);
    if (urlInput) urlInput.value = providerConfig.apiUrl || '';
    const enabledCheckbox = document.getElementById(`${provider}-enabled`);
    if (enabledCheckbox) enabledCheckbox.checked = !!providerConfig.enabled;
  };

  ['google','openai','anthropic'].forEach(loadProviderConfig);

  // Prompt
  const customPrompt = config?.promptTemplates?.custom || '';
  document.getElementById('custom-prompt').value = customPrompt;

  // AnkiConfig
  document.getElementById('default-deck').value = config?.ankiConfig?.defaultDeck || '';
  document.getElementById('default-model').value = config?.ankiConfig?.defaultModel || '';
  currentModelFields = config?.ankiConfig?.modelFields || [];

  // 如果已经有默认模型，触发字段显示
  if (config?.ankiConfig?.defaultModel) {
    handleModelChange();
  }

  // StyleConfig
  document.getElementById('font-size-select').value = config?.styleConfig?.fontSize || '14px';
  document.getElementById('text-align-select').value = config?.styleConfig?.textAlign || 'left';
  document.getElementById('line-height-select').value = config?.styleConfig?.lineHeight || '1.4';
  
  console.log('設定を読み込みました。');
}

/**
 * 保存ボタン ハンドラ
 */
async function handleSave() {
  // 選択中のAIプロバイダ
  const provider = document.getElementById('ai-provider').value;
  
  // DOM から情報を取得（APIキーは actualApiKeys から）
  const googleConfig = {
    apiKey: actualApiKeys.google,
    modelName: document.getElementById('google-model-name').value,
    apiUrl: document.getElementById('google-api-url').value,
    enabled: document.getElementById('google-enabled').checked,
    healthStatus: 'unknown'
  };
  
  const openaiConfig = {
    apiKey: actualApiKeys.openai,
    modelName: document.getElementById('openai-model-name').value,
    apiUrl: document.getElementById('openai-api-url').value,
    enabled: document.getElementById('openai-enabled').checked,
    healthStatus: 'unknown'
  };
  
  const anthropicConfig = {
    apiKey: actualApiKeys.anthropic,
    modelName: document.getElementById('anthropic-model-name').value,
    apiUrl: document.getElementById('anthropic-api-url').value,
    enabled: document.getElementById('anthropic-enabled').checked,
    healthStatus: 'unknown'
  };

  // Prompt
  const customPrompt = document.getElementById('custom-prompt').value;
  const language = document.getElementById('language-select').value;
  const defaultDeck = document.getElementById('default-deck').value;
  const defaultModel = document.getElementById('default-model').value;
  
  // スタイル
  const fontSize = document.getElementById('font-size-select').value;
  const textAlign = document.getElementById('text-align-select').value;
  const lineHeight = document.getElementById('line-height-select').value;

  // 新しい設定
  const existingPromptTemplatesByModel = { ...(currentConfig?.promptTemplates?.promptTemplatesByModel || {}) };

  const newConfig = {
    aiConfig: {
      provider: provider,
      models: {
        google: googleConfig,
        openai: openaiConfig,
        anthropic: anthropicConfig
      },
      fallbackOrder: ['google', 'openai', 'anthropic']
    },
    promptTemplates: {
      custom: customPrompt,
      promptTemplatesByModel: existingPromptTemplatesByModel
    },
    ankiConfig: {
      defaultDeck: defaultDeck,
      defaultModel: defaultModel,
      modelFields: currentModelFields,
      defaultTags: []
    },
    styleConfig: {
      fontSize: fontSize,
      textAlign: textAlign,
      lineHeight: lineHeight
    },
    language: language
  };

  let promptValueForSelectedModel = null;

  // 获取当前选择的模型
  const selectedModel = document.getElementById('default-model').value;

  if (selectedModel) {
    const promptTextarea = document.getElementById('custom-prompt-textarea');
    if (promptTextarea && !promptTextarea.disabled) {
      const normalizedValue = promptTextarea.value.trim();
      if (normalizedValue) {
        if (promptTextarea.value !== normalizedValue) {
          promptTextarea.value = normalizedValue;
        }
        savePromptForModel(selectedModel, normalizedValue, newConfig);
        promptValueForSelectedModel = normalizedValue;
      } else {
        delete existingPromptTemplatesByModel[selectedModel];
        promptValueForSelectedModel = '';
      }
    }
  }

  try {
    await saveConfig(newConfig);
    currentConfig = newConfig; // 更新本地配置缓存

    if (selectedModel && promptEditorState.currentModel === selectedModel && promptValueForSelectedModel !== null) {
      promptEditorState.lastSavedPrompt = promptValueForSelectedModel;
      markPromptDirtyFlag(false);
    }

    updateStatus('save-status', '设置已保存', 'success');

    // 保存后更新当前提供商状态
    setTimeout(() => {
      updateCurrentProviderStatus();
    }, 500);

  } catch (error) {
    console.error('保存设置出错:', error);
    updateStatus('save-status', `保存出错: ${error.message}`, 'error');
  }
}

/**
 * モデル選択変更 ハンドラ
 */
async function handleModelChange() {
  const modelName = document.getElementById('default-model').value;
  if (!modelName) {
    document.getElementById('field-mapping').style.display = 'none';
    currentModelFields = []; // クリア
    return;
  }
  
  try {
    const fieldsResult = await getModelFieldNames(modelName);
    if (fieldsResult.error) {
      throw new Error(fieldsResult.error);
    }
    
    // 取得したフィールド名を保持
    currentModelFields = fieldsResult.result;

    // 显示字段信息
    const fieldMappingDiv = document.getElementById('field-mapping');
    const container = fieldMappingDiv.querySelector('.field-mapping-container');

    container.innerHTML = `
      <h4>模型字段 (${fieldsResult.result.length}个):</h4>
      <div class="field-tags">
        ${fieldsResult.result.map(field => `<span class="field-tag">${field}</span>`).join('')}
      </div>
    `;

    // 添加模式说明
    const modeDiv = document.createElement('div');
    modeDiv.className = 'mode-info';
    modeDiv.style.marginTop = '15px';

    if (fieldsResult.result.length <= 2) {
      modeDiv.innerHTML = `
        <div class="legacy-mode-info">
          <p><strong>🔄 兼容模式</strong></p>
          <p>该模型字段数 ≤ 2，将使用传统的正面/背面模式。</p>
        </div>
      `;
    } else {
      modeDiv.innerHTML = `
        <div class="dynamic-mode-info">
          <p><strong>✨ 动态字段模式</strong></p>
          <p>该模型支持多字段，AI将自动填充所有字段。popup页面将根据字段名智能生成相应的输入区域。</p>
        </div>
      `;
    }

    container.appendChild(modeDiv);
    fieldMappingDiv.style.display = 'block';

    // 显示Prompt配置区域并加载对应模板的Prompt
    showPromptConfig(modelName, currentModelFields);
    loadAndDisplayPromptForModel(modelName);

  } catch (error) {
    console.error('获取字段失败:', error);
    document.getElementById('field-mapping').style.display = 'none';
    currentModelFields = []; // クリア
  }
}

/**
 * 测试 Anki 连接
 */
async function handleTestAnki() {
  updateStatus('anki-status', '正在测试...', 'loading');
  try {
    const result = await testAnki();
    if (result.error) {
      throw new Error(result.error);
    }
    updateStatus('anki-status', `连接成功，AnkiConnect 版本: ${result.result}`, 'success');
    
    // 连接成功后，拉取 Anki 数据
    await loadAnkiData();
  } catch (error) {
    console.error('测试 Anki 连接错误:', error);
    updateStatus('anki-status', `连接错误: ${error.message}`, 'error');
  }
}

/**
 * 提供商选择改变
 */
function handleProviderChange() {
  const selectedProvider = document.getElementById('ai-provider').value;

  // 先隐藏全部
  document.querySelectorAll('.provider-config').forEach(config => {
    config.style.display = 'none';
  });

  // 显示选中项
  const activeConfig = document.getElementById(`config-${selectedProvider}`);
  if (activeConfig) {
    activeConfig.style.display = 'block';
  }

  // 更新当前提供商状态显示
  updateCurrentProviderStatus();
}

/**
 * 更新当前选中提供商状态
 */
async function updateCurrentProviderStatus() {
  try {
    const selectedProvider = document.getElementById('ai-provider').value;
    const health = await getProvidersHealth();
    const statusContainer = document.getElementById('current-provider-status');

    if (!selectedProvider || !health[selectedProvider]) {
      statusContainer.innerHTML = '<p class="text-gray-500">未选择提供商</p>';
      return;
    }

    const status = health[selectedProvider];
    const providerNames = {
      google: 'Google Gemini',
      openai: 'OpenAI GPT',
      anthropic: 'Anthropic Claude'
    };

    const statusItem = document.createElement('div');
    statusItem.className = `provider-status-item ${status.enabled ? '' : 'disabled'}`;

    const indicator = document.createElement('div');
    indicator.className = `status-indicator ${status.status}`;

    const providerName = document.createElement('div');
    providerName.className = 'provider-name';
    providerName.textContent = providerNames[selectedProvider] || selectedProvider;

    const statusText = document.createElement('div');
    statusText.className = 'status-text';

    let statusMessage = '';
    if (!status.hasApiKey) {
      statusMessage = '未设置 API Key';
    } else if (!status.enabled) {
      statusMessage = '未启用';
    } else {
      switch (status.status) {
        case 'healthy':
          statusMessage = '连接正常';
          break;
        case 'error':
          statusMessage = `异常: ${status.lastError || '未知错误'}`;
          break;
        default:
          statusMessage = '未知状态';
      }
    }

    if (status.lastCheck) {
      const checkTime = new Date(status.lastCheck).toLocaleString();
      statusMessage += ` (检查时间: ${checkTime})`;
    }

    statusText.textContent = statusMessage;

    statusItem.appendChild(indicator);
    statusItem.appendChild(providerName);
    statusItem.appendChild(statusText);

    statusContainer.innerHTML = '';
    statusContainer.appendChild(statusItem);

  } catch (error) {
    console.error('更新状态出错:', error);
    const statusContainer = document.getElementById('current-provider-status');
    statusContainer.innerHTML = '<p class="text-red-500">状态获取失败</p>';
  }
}

/**
 * 单个提供商连接测试
 */
async function handleTestProvider(provider) {
  const modelSelect = document.getElementById(`${provider}-model-name`);
  
  try {
    const result = await testAi(provider, {
      modelName: modelSelect ? modelSelect.value : undefined
    });
    
    if (result.success) {
      updateStatus('ai-status', result.message, 'success');
    } else {
      updateStatus('ai-status', result.message, 'error');
    }

    // 刷新当前提供商状态
    updateCurrentProviderStatus();

  } catch (error) {
    console.error(`${provider} 测试失败:`, error);
    updateStatus('ai-status', `测试失败: ${error.message}`, 'error');
  }
}


/**
 * 读取 Anki 数据（牌组/模型）
 */
async function loadAnkiData() {
  try {
    // 牌组
    const decksResult = await getDeckNames();
    if (decksResult.error) {
      throw new Error(`读取牌组失败: ${decksResult.error}`);
    }
    
    // 模型
    const modelsResult = await getModelNames();
    if (modelsResult.error) {
      throw new Error(`读取模型失败: ${modelsResult.error}`);
    }
    
    // 牌组下拉
    const deckSelect = document.getElementById('default-deck');
    deckSelect.innerHTML = '<option value="">请选择默认牌组</option>';
    decksResult.result.forEach(deck => {
      const option = document.createElement('option');
      option.value = deck;
      option.textContent = deck;
      deckSelect.appendChild(option);
    });
    
    // 模型下拉
    const modelSelect = document.getElementById('default-model');
    modelSelect.innerHTML = '<option value="">请选择默认模型</option>';
    modelsResult.result.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
    
    // 显示刷新按钮
    document.getElementById('refresh-anki-data').style.display = 'inline-block';
    
  } catch (error) {
    console.error('读取 Anki 数据出错:', error);
    updateStatus('anki-status', `出错: ${error.message}`, 'error');
  }
}

/**
 * 刷新 Anki 数据
 */
async function handleRefreshAnkiData() {
  await loadAnkiData();
}

/**
 * 样式预览更新
 */
function updateStylePreview() {
  const fontSize = document.getElementById('font-size-select').value;
  const textAlign = document.getElementById('text-align-select').value;
  const lineHeight = document.getElementById('line-height-select').value;
  
  const previewContent = document.getElementById('preview-content');
  previewContent.style.fontSize = fontSize;
  previewContent.style.textAlign = textAlign;
  previewContent.style.lineHeight = lineHeight;
}

/**
 * ステータス表示更新
 * @param {string} elementId - 要素ID
 * @param {string} message - メッセージ
 * @param {'success'|'error'|'loading'} type - 種別
 */
function updateStatus(elementId, message, type) {
  const statusElement = document.getElementById(elementId);
  statusElement.textContent = message;
  statusElement.className = `status-${type}`;
}

/**
 * Tab导航初始化函数
 */
function initTabNavigation() {
  const tabButtons = document.querySelectorAll('.settings-tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // 移除所有active状态
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
        // 重置按钮样式
        btn.classList.remove('text-slate-600', 'bg-slate-50', 'border-slate-500');
        btn.classList.add('text-gray-500', 'border-transparent');
      });
      
      tabContents.forEach(content => {
        content.classList.remove('active');
      });
      
      // 设置当前按钮为active
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      button.classList.remove('text-gray-500', 'border-transparent');
      button.classList.add('text-slate-600', 'bg-slate-50', 'border-slate-500');
      
      // 显示对应内容
      const targetContent = document.getElementById(targetTab);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
    
    // 键盘支持
    button.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        button.click();
      }
      
      // 左右箭头键导航
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        const currentIndex = Array.from(tabButtons).indexOf(button);
        const nextIndex = e.key === 'ArrowLeft' 
          ? (currentIndex - 1 + tabButtons.length) % tabButtons.length
          : (currentIndex + 1) % tabButtons.length;
        
        tabButtons[nextIndex].focus();
        tabButtons[nextIndex].click();
      }
    });
  });
}

/**
 * 可选：URL hash路由支持
 */
function initTabRouting() {
  // 监听hash变化
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1);
    const targetButton = document.querySelector(`[data-tab="${hash}"]`);
    if (targetButton) {
      targetButton.click();
    }
  });
  
  // 页面加载时根据hash设置初始tab
  if (window.location.hash) {
    const hash = window.location.hash.slice(1);
    const targetButton = document.querySelector(`[data-tab="${hash}"]`);
    if (targetButton) {
      targetButton.click();
    }
  }
}

// ==================== 配置管理功能 ====================

/**
 * 点击导入配置按钮
 */
function handleImportConfigurationClick() {
  document.getElementById('import-config-input').click();
}

/**
 * 处理导入配置文件
 */
async function handleImportConfigurationFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedConfig = JSON.parse(text);

    // 简单验证配置格式
    if (!importedConfig.version || !importedConfig.aiConfig) {
      throw new Error('配置文件格式不正确');
    }

    // 合并配置（保留当前的API密钥，避免明文导入）
    const mergedConfig = {
      ...importedConfig,
      aiConfig: {
        ...importedConfig.aiConfig,
        models: {
          ...importedConfig.aiConfig.models
        }
      }
    };

    // 清空API Key（为安全考虑）
    Object.keys(mergedConfig.aiConfig.models).forEach(provider => {
      if (mergedConfig.aiConfig.models[provider]) {
        mergedConfig.aiConfig.models[provider].apiKey = '';
      }
    });

    await saveConfig(mergedConfig);
    updateStatus('save-status', '配置导入成功，请重新配置API密钥', 'success');

    // 重新加载页面配置
    setTimeout(() => window.location.reload(), 1500);
  } catch (error) {
    console.error('导入配置失败:', error);
    updateStatus('save-status', `导入失败: ${error.message}`, 'error');
  }

  // 清空文件输入，允许重复导入相同文件
  event.target.value = '';
}

/**
 * 重置配置 - 使用现有的handleResetConfiguration函数
 */
// 这个函数已经在文件中存在了，不需要重复定义
