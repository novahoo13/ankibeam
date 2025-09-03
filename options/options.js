// options.js - 配置页面逻辑
// 负责加载、保存和测试配置

import { saveConfig, loadConfig } from '../utils/storage.js';
import { testConnection as testAnki, getDeckNames, getModelNames, getModelFieldNames } from '../utils/ankiconnect.js';
import { testConnection as testAi, getProvidersHealth, testAllProviders } from '../utils/ai-service.js';

document.addEventListener('DOMContentLoaded', () => {
  // 加载现有配置并填充表单
  loadAndDisplayConfig();

  // 绑定事件监听器
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('test-anki-btn').addEventListener('click', handleTestAnki);
  document.getElementById('refresh-anki-data').addEventListener('click', handleRefreshAnkiData);
  document.getElementById('default-model').addEventListener('change', handleModelChange);
  
  // AI供应商相关事件监听
  document.getElementById('ai-provider').addEventListener('change', handleProviderChange);
  document.getElementById('refresh-status-btn').addEventListener('click', refreshProviderStatus);
  document.getElementById('test-all-btn').addEventListener('click', handleTestAllProviders);
  
  // 单个供应商测试按钮
  document.querySelectorAll('.test-provider-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const provider = e.target.getAttribute('data-provider');
      handleTestProvider(provider);
    });
  });
  
  // 样式配置事件监听
  document.getElementById('font-size-select').addEventListener('change', updateStylePreview);
  document.getElementById('text-align-select').addEventListener('change', updateStylePreview);
  document.getElementById('line-height-select').addEventListener('change', updateStylePreview);
  
  // 初始化供应商状态显示
  refreshProviderStatus();
});

/**
 * 加载并显示配置
 */
async function loadAndDisplayConfig() {
  const config = await loadConfig();

  // 加载AI配置
  const aiConfig = config?.aiConfig || {};
  
  // 设置当前主要供应商
  document.getElementById('ai-provider').value = aiConfig.provider || 'google';
  
  // 加载各供应商配置
  const models = aiConfig.models || {};
  
  // Google配置
  const googleConfig = models.google || {};
  document.getElementById('google-api-key').value = googleConfig.apiKey || '';
  document.getElementById('google-model-name').value = googleConfig.modelName || 'gemini-1.5-flash';
  document.getElementById('google-api-url').value = googleConfig.apiUrl || 'https://generativelanguage.googleapis.com/v1beta/models';
  document.getElementById('google-enabled').checked = googleConfig.enabled !== false;
  
  // OpenAI配置
  const openaiConfig = models.openai || {};
  document.getElementById('openai-api-key').value = openaiConfig.apiKey || '';
  document.getElementById('openai-model-name').value = openaiConfig.modelName || 'gpt-4o';
  document.getElementById('openai-api-url').value = openaiConfig.apiUrl || 'https://api.openai.com/v1/chat/completions';
  document.getElementById('openai-enabled').checked = openaiConfig.enabled === true;
  
  // Anthropic配置
  const anthropicConfig = models.anthropic || {};
  document.getElementById('anthropic-api-key').value = anthropicConfig.apiKey || '';
  document.getElementById('anthropic-model-name').value = anthropicConfig.modelName || 'claude-3-5-sonnet-20241022';
  document.getElementById('anthropic-api-url').value = anthropicConfig.apiUrl || 'https://api.anthropic.com/v1/messages';
  document.getElementById('anthropic-enabled').checked = anthropicConfig.enabled === true;

  // 其他配置
  document.getElementById('custom-prompt').value = config?.promptTemplates?.custom || '';
  document.getElementById('language-select').value = config?.language || 'zh-CN';
  
  // 加载样式配置
  const styleConfig = config?.styleConfig || {};
  document.getElementById('font-size-select').value = styleConfig.fontSize || '14px';
  document.getElementById('text-align-select').value = styleConfig.textAlign || 'left';
  document.getElementById('line-height-select').value = styleConfig.lineHeight || '1.4';

  // 加载Anki配置
  const ankiConfig = config?.ankiConfig;
  if (ankiConfig?.defaultDeck) {
    document.getElementById('default-deck').innerHTML = `<option value="${ankiConfig.defaultDeck}">${ankiConfig.defaultDeck}</option>`;
    document.getElementById('default-deck').value = ankiConfig.defaultDeck;
  }
  if (ankiConfig?.defaultModel) {
    document.getElementById('default-model').innerHTML = `<option value="${ankiConfig.defaultModel}">${ankiConfig.defaultModel}</option>`;
    document.getElementById('default-model').value = ankiConfig.defaultModel;
  }

  // 显示当前供应商的配置面板
  handleProviderChange();
  
  // 更新样式预览
  updateStylePreview();
  
  console.log('配置已加载并显示。');
}

/**
 * 处理保存按钮点击事件
 */
async function handleSave() {
  // 收集AI供应商配置
  const provider = document.getElementById('ai-provider').value;
  
  const googleConfig = {
    apiKey: document.getElementById('google-api-key').value,
    modelName: document.getElementById('google-model-name').value,
    apiUrl: document.getElementById('google-api-url').value,
    enabled: document.getElementById('google-enabled').checked,
    healthStatus: 'unknown'
  };
  
  const openaiConfig = {
    apiKey: document.getElementById('openai-api-key').value,
    modelName: document.getElementById('openai-model-name').value,
    apiUrl: document.getElementById('openai-api-url').value,
    enabled: document.getElementById('openai-enabled').checked,
    healthStatus: 'unknown'
  };
  
  const anthropicConfig = {
    apiKey: document.getElementById('anthropic-api-key').value,
    modelName: document.getElementById('anthropic-model-name').value,
    apiUrl: document.getElementById('anthropic-api-url').value,
    enabled: document.getElementById('anthropic-enabled').checked,
    healthStatus: 'unknown'
  };

  // 其他配置
  const customPrompt = document.getElementById('custom-prompt').value;
  const language = document.getElementById('language-select').value;
  const defaultDeck = document.getElementById('default-deck').value;
  const defaultModel = document.getElementById('default-model').value;
  
  // 收集样式配置
  const fontSize = document.getElementById('font-size-select').value;
  const textAlign = document.getElementById('text-align-select').value;
  const lineHeight = document.getElementById('line-height-select').value;

  // 构建完整的配置对象
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
      custom: customPrompt
    },
    ankiConfig: {
      defaultDeck: defaultDeck,
      defaultModel: defaultModel,
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
    updateStatus('save-status', '配置已保存！', 'success');
    
    // 保存后刷新供应商状态
    setTimeout(() => {
      refreshProviderStatus();
    }, 500);
    
  } catch (error) {
    console.error('保存配置失败:', error);
    updateStatus('save-status', `保存失败: ${error.message}`, 'error');
  }
}

/**
 * 处理测试 Anki 连接按钮点击事件
 */
async function handleTestAnki() {
  updateStatus('anki-status', '正在测试...', 'loading');
  try {
    const result = await testAnki();
    if (result.error) {
      throw new Error(result.error);
    }
    updateStatus('anki-status', `连接成功！AnkiConnect 版本: ${result.result}`, 'success');
    
    // 连接成功后自动加载Anki数据
    await loadAnkiData();
  } catch (error) {
    console.error('Anki 连接测试失败:', error);
    updateStatus('anki-status', `连接失败: ${error.message}`, 'error');
  }
}

/**
 * 处理供应商切换事件
 */
function handleProviderChange() {
  const selectedProvider = document.getElementById('ai-provider').value;
  
  // 隐藏所有配置面板
  document.querySelectorAll('.provider-config').forEach(config => {
    config.style.display = 'none';
  });
  
  // 显示选中的配置面板
  const activeConfig = document.getElementById(`config-${selectedProvider}`);
  if (activeConfig) {
    activeConfig.style.display = 'block';
  }
}

/**
 * 刷新供应商状态显示
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
        statusMessage = '未配置API Key';
      } else if (!status.enabled) {
        statusMessage = '已禁用';
      } else {
        switch (status.status) {
          case 'healthy':
            statusMessage = '连接正常';
            break;
          case 'error':
            statusMessage = `连接错误: ${status.lastError || '未知错误'}`;
            break;
          default:
            statusMessage = '状态未知';
        }
      }
      
      if (status.lastCheck) {
        const checkTime = new Date(status.lastCheck).toLocaleString();
        statusMessage += ` (最后检查: ${checkTime})`;
      }
      
      statusText.textContent = statusMessage;
      
      statusItem.appendChild(indicator);
      statusItem.appendChild(providerName);
      statusItem.appendChild(statusText);
      statusContainer.appendChild(statusItem);
    });
    
  } catch (error) {
    console.error('刷新供应商状态失败:', error);
  }
}

/**
 * 测试单个供应商连接
 */
async function handleTestProvider(provider) {
  const apiKeyInput = document.getElementById(`${provider}-api-key`);
  const modelSelect = document.getElementById(`${provider}-model-name`);
  
  const apiKey = apiKeyInput.value;
  const modelName = modelSelect.value;
  
  if (!apiKey) {
    updateStatus('ai-status', `请先输入 ${provider} 的 API Key`, 'error');
    return;
  }
  
  updateStatus('ai-status', `正在测试 ${provider} 连接...`, 'loading');
  
  try {
    const result = await testAi(provider, apiKey, modelName);
    if (result.success) {
      updateStatus('ai-status', result.message, 'success');
    } else {
      updateStatus('ai-status', result.message, 'error');
    }
    
    // 刷新状态显示
    refreshProviderStatus();
    
  } catch (error) {
    console.error(`${provider} 连接测试失败:`, error);
    updateStatus('ai-status', `连接测试失败: ${error.message}`, 'error');
  }
}

/**
 * 测试所有已配置的供应商
 */
async function handleTestAllProviders() {
  updateStatus('ai-status', '正在测试所有供应商...', 'loading');
  
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
                      
    const summary = `测试完成: ${successCount}/${totalCount} 个供应商可用`;
    updateStatus('ai-status', `${summary}\n${messages.join('\n')}`, statusType);
    
    // 刷新状态显示
    refreshProviderStatus();
    
  } catch (error) {
    console.error('测试所有供应商失败:', error);
    updateStatus('ai-status', `测试失败: ${error.message}`, 'error');
  }
}

/**
 * 加载Anki数据（牌组和模板）
 */
async function loadAnkiData() {
  try {
    // 获取牌组列表
    const decksResult = await getDeckNames();
    if (decksResult.error) {
      throw new Error(`获取牌组失败: ${decksResult.error}`);
    }
    
    // 获取模板列表
    const modelsResult = await getModelNames();
    if (modelsResult.error) {
      throw new Error(`获取模板失败: ${modelsResult.error}`);
    }
    
    // 填充牌组下拉框
    const deckSelect = document.getElementById('default-deck');
    deckSelect.innerHTML = '<option value="">请选择牌组</option>';
    decksResult.result.forEach(deck => {
      const option = document.createElement('option');
      option.value = deck;
      option.textContent = deck;
      deckSelect.appendChild(option);
    });
    
    // 填充模板下拉框
    const modelSelect = document.getElementById('default-model');
    modelSelect.innerHTML = '<option value="">请选择模板</option>';
    modelsResult.result.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
    
    // 显示刷新按钮
    document.getElementById('refresh-anki-data').style.display = 'inline-block';
    
  } catch (error) {
    console.error('加载Anki数据失败:', error);
    updateStatus('anki-status', `加载数据失败: ${error.message}`, 'error');
  }
}

/**
 * 处理刷新Anki数据按钮点击事件
 */
async function handleRefreshAnkiData() {
  await loadAnkiData();
}

/**
 * 处理模板变化事件
 */
async function handleModelChange() {
  const modelName = document.getElementById('default-model').value;
  if (!modelName) {
    document.getElementById('field-mapping').style.display = 'none';
    return;
  }
  
  try {
    const fieldsResult = await getModelFieldNames(modelName);
    if (fieldsResult.error) {
      throw new Error(fieldsResult.error);
    }
    
    // 显示字段映射区域
    const fieldMappingDiv = document.getElementById('field-mapping');
    const container = fieldMappingDiv.querySelector('.field-mapping-container');
    
    container.innerHTML = '<p><strong>该模板包含以下字段：</strong></p>';
    
    fieldsResult.result.forEach((field, index) => {
      const fieldDiv = document.createElement('div');
      fieldDiv.innerHTML = `
        <label>${field}</label>
        <span style="margin-left: 10px; color: #666;">
          (字段 ${index + 1})
        </span>
      `;
      container.appendChild(fieldDiv);
    });
    
    const noteDiv = document.createElement('div');
    noteDiv.style.marginTop = '10px';
    noteDiv.innerHTML = `
      <p style="font-size: 0.9em; color: #888;">
        <strong>注意：</strong>扩展将自动使用前两个字段作为"正面"和"背面"。
        当前会使用：<strong>${fieldsResult.result[0] || '无'}</strong>（正面）和<strong>${fieldsResult.result[1] || '无'}</strong>（背面）。
      </p>
    `;
    container.appendChild(noteDiv);
    
    fieldMappingDiv.style.display = 'block';
    
  } catch (error) {
    console.error('获取字段信息失败:', error);
    document.getElementById('field-mapping').style.display = 'none';
  }
}

/**
 * 更新样式预览
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
 * 更新页面上的状态消息
 * @param {string} elementId - 状态消息元素的ID
 * @param {string} message - 要显示的消息
 * @param {'success'|'error'|'loading'} type - 消息类型
 */
function updateStatus(elementId, message, type) {
  const statusElement = document.getElementById(elementId);
  statusElement.textContent = message;
  statusElement.className = `status-${type}`;
}
