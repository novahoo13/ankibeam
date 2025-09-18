// options.js - オプション画面
// 目的: 設定の表示・保存、各種接続のテスト

import { saveConfig, loadConfig } from '../utils/storage.js';
import { testConnection as testAnki, getDeckNames, getModelNames, getModelFieldNames } from '../utils/ankiconnect.js';
import { testConnection as testAi, getProvidersHealth, testAllProviders } from '../utils/ai-service.js';
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
  document.getElementById('refresh-status-btn').addEventListener('click', refreshProviderStatus);
  document.getElementById('test-all-btn').addEventListener('click', handleTestAllProviders);
  
  // APIキーの表示切替
  setupApiKeyInputs();
  
  // 各プロバイダ接続テストボタン
  setupTestProviderButtons();
  
  // スタイルプレビュー
  document.getElementById('font-size-select').addEventListener('change', updateStylePreview);
  document.getElementById('text-align-select').addEventListener('change', updateStylePreview);
  document.getElementById('line-height-select').addEventListener('change', updateStylePreview);
  
  // 初回の状態更新
  refreshProviderStatus();
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
      promptTemplatesByModel: currentConfig?.promptTemplates?.promptTemplatesByModel || {}
    },
    ankiConfig: {
      defaultDeck: defaultDeck,
      defaultModel: defaultModel,
      modelFields: currentModelFields,
      promptTemplatesByModel: currentConfig?.ankiConfig?.promptTemplatesByModel || {},
      defaultTags: []
    },
    styleConfig: {
      fontSize: fontSize,
      textAlign: textAlign,
      lineHeight: lineHeight
    },
    language: language
  };

  try {
    await saveConfig(newConfig);
    currentConfig = newConfig; // 更新本地配置缓存
    updateStatus('save-status', '设置已保存', 'success');

    // 保存後に状態更新
    setTimeout(() => {
      refreshProviderStatus();
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
}

/**
 * 刷新各提供商状态
 */
async function refreshProviderStatus() {
  try {
    const health = await getProvidersHealth();
    const statusContainer = document.getElementById('provider-status');
    
    statusContainer.innerHTML = '';
    
    const providerNames = {
      google: 'Google Gemini',
      openai: 'OpenAI GPT',
      anthropic: 'Anthropic Claude'
    };
    
    Object.entries(health).forEach(([provider, status]) => {
      const statusItem = document.createElement('div');
      statusItem.className = `provider-status-item ${status.enabled ? '' : 'disabled'}`;
      
      const indicator = document.createElement('div');
      indicator.className = `status-indicator ${status.status}`;
      
      const providerName = document.createElement('div');
      providerName.className = 'provider-name';
      providerName.textContent = providerNames[provider] || provider;
      
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
            statusMessage = '未知';
        }
      }
      
      if (status.lastCheck) {
        const checkTime = new Date(status.lastCheck).toLocaleString();
        statusMessage += `（上次检查: ${checkTime}）`;
      }
      
      statusText.textContent = statusMessage;
      
      statusItem.appendChild(indicator);
      statusItem.appendChild(providerName);
      statusItem.appendChild(statusText);
      statusContainer.appendChild(statusItem);
    });
    
  } catch (error) {
    console.error('刷新状态出错:', error);
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
    
    // 刷新状态
    refreshProviderStatus();
    
  } catch (error) {
    console.error(`${provider} 测试失败:`, error);
    updateStatus('ai-status', `测试失败: ${error.message}`, 'error');
  }
}

/**
 * 测试全部提供商连接
 */
async function handleTestAllProviders() {
  updateStatus('ai-status', '正在测试全部连接...', 'loading');
  
  try {
    const results = await testAllProviders();
    
    let successCount = 0;
    let totalCount = 0;
    let messages = [];
    
    Object.entries(results).forEach(([provider, result]) => {
      totalCount++;
      if (result.success) {
        successCount++;
        messages.push(`✓ ${provider}: ${result.message}`);
      } else {
        messages.push(`✗ ${provider}: ${result.message}`);
      }
    });
    
    const statusType = successCount === totalCount ? 'success' :
                      successCount === 0 ? 'error' : 'loading';
                      
    const summary = `通过数: ${successCount}/${totalCount}`;
    updateStatus('ai-status', `${summary}\n${messages.join('\n')}`, statusType);
    
    // 刷新状态
    refreshProviderStatus();
    
  } catch (error) {
    console.error('测试全部连接出错:', error);
    updateStatus('ai-status', `出错: ${error.message}`, 'error');
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

