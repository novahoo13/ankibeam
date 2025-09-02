// options.js - 配置页面逻辑
// 负责加载、保存和测试配置

import { saveConfig, loadConfig } from '../utils/storage.js';
import { testConnection as testAnki } from '../utils/ankiconnect.js';
import { testConnection as testAi } from '../utils/ai-service.js';

document.addEventListener('DOMContentLoaded', () => {
  // 加载现有配置并填充表单
  loadAndDisplayConfig();

  // 绑定事件监听器
  document.getElementById('save-btn').addEventListener('click', handleSave);
  document.getElementById('test-anki-btn').addEventListener('click', handleTestAnki);
  document.getElementById('test-ai-btn').addEventListener('click', handleTestAi);
  // TODO: 实现 'reset-prompt-btn' 的逻辑
});

/**
 * 加载并显示配置
 */
async function loadAndDisplayConfig() {
  const config = await loadConfig();
  if (config) {
    // AI 配置
    if (config.aiConfig && config.aiConfig.models && config.aiConfig.models.gemini) {
      document.getElementById('api-key').value = config.aiConfig.models.gemini.apiKey || '';
      document.getElementById('model-name').value = config.aiConfig.models.gemini.modelName || 'gemini-1.5-flash';
    }
    // Prompt 配置
    if (config.promptTemplates) {
      document.getElementById('custom-prompt').value = config.promptTemplates.custom || '';
    }
    // 语言配置
    if (config.language) {
        document.getElementById('language-select').value = config.language;
    }
  }
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
    language: language
    // ankiConfig 等其他配置
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
  if (!apiKey) {
    updateStatus('ai-status', '请输入 API Key', 'error');
    return;
  }
  updateStatus('ai-status', '正在测试...', 'loading');
  try {
    // 注意：testConnection 需要接收 key
    await testAi(apiKey);
    updateStatus('ai-status', '连接成功！API Key 有效。', 'success');
  } catch (error) {
    console.error('AI 连接测试失败:', error);
    updateStatus('ai-status', `连接失败: ${error.message}`, 'error');
  }
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
