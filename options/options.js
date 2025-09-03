// options.js - 配置页面逻辑
// 负责加载、保存和测试配置

import { saveConfig, loadConfig } from '../utils/storage.js';
import { testConnection as testAnki, getDeckNames, getModelNames, getModelFieldNames } from '../utils/ankiconnect.js';
import { testConnection as testAi } from '../utils/ai-service.js';

document.addEventListener('DOMContentLoaded', () => {
  // 加载现有配置并填充表单
  loadAndDisplayConfig();

  // 绑定事件监听器
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('test-anki-btn').addEventListener('click', handleTestAnki);
  document.getElementById('test-ai-btn').addEventListener('click', handleTestAi);
  document.getElementById('refresh-anki-data').addEventListener('click', handleRefreshAnkiData);
  document.getElementById('default-model').addEventListener('change', handleModelChange);
  
  // 样式配置事件监听
  document.getElementById('font-size-select').addEventListener('change', updateStylePreview);
  document.getElementById('text-align-select').addEventListener('change', updateStylePreview);
  document.getElementById('line-height-select').addEventListener('change', updateStylePreview);
  
  // TODO: 实现 'reset-prompt-btn' 的逻辑
});

/**
 * 加载并显示配置
 */
async function loadAndDisplayConfig() {
  const config = await loadConfig();

  // 使用可选链 (?.) 安全地访问嵌套属性，并为每个字段提供默认值
  const geminiConfig = config?.aiConfig?.models?.gemini;
  document.getElementById('api-key').value = geminiConfig?.apiKey || '';
  document.getElementById('model-name').value = geminiConfig?.modelName || 'gemini-1.5-flash';

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

  // 更新样式预览
  updateStylePreview();
  
  console.log('配置已加载并显示。');
}

/**
 * 处理保存按钮点击事件
 */
async function handleSave() {
  // 从表单收集数据
  const apiKey = document.getElementById('api-key').value;
  const modelName = document.getElementById('model-name').value;
  const customPrompt = document.getElementById('custom-prompt').value;
  const language = document.getElementById('language-select').value;
  const defaultDeck = document.getElementById('default-deck').value;
  const defaultModel = document.getElementById('default-model').value;
  
  // 收集样式配置
  const fontSize = document.getElementById('font-size-select').value;
  const textAlign = document.getElementById('text-align-select').value;
  const lineHeight = document.getElementById('line-height-select').value;

  // 构建配置对象 (结构参考开发文档)
  const newConfig = {
    aiConfig: {
      provider: 'gemini',
      models: {
        gemini: {
          apiKey: apiKey, // 存储前应加密
          modelName: modelName,
        }
      }
    },
    promptTemplates: {
      custom: customPrompt
    },
    ankiConfig: {
      defaultDeck: defaultDeck,
      defaultModel: defaultModel,
      defaultTags: [] // 暂时为空数组，以后可以扩展
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
 * 处理测试 AI 连接按钮点击事件
 */
async function handleTestAi() {
  const apiKey = document.getElementById('api-key').value;
  const modelName = document.getElementById('model-name').value; // 获取模型名称
  if (!apiKey) {
    updateStatus('ai-status', '请输入 API Key', 'error');
    return;
  }
  updateStatus('ai-status', '正在测试...', 'loading');
  try {
    // 将 apiKey 和 modelName 一起传递给测试函数
    await testAi(apiKey, modelName);
    updateStatus('ai-status', '连接成功！API Key 和模型均有效。', 'success');
  } catch (error) {
    console.error('AI 连接测试失败:', error);
    updateStatus('ai-status', `连接失败: ${error.message}`, 'error');
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
