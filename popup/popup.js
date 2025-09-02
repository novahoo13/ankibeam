// popup.js - 主界面逻辑
// 负责处理用户交互、调用服务并更新UI

import { parseText } from '../utils/ai-service.js';
import { addNote } from '../utils/ankiconnect.js';
import { loadConfig } from '../utils/storage.js';
// import { i18n } from '../utils/i18n.js'; // 待实现

// 模块级变量，用于存储加载的配置
let config = {};

document.addEventListener('DOMContentLoaded', () => {
  // 初始化：加载配置、绑定事件监听器
  initialize();
});

/**
 * 初始化函数
 */
async function initialize() {
  // 加载配置并存储到模块级变量中，如果没配置则使用空对象
  config = await loadConfig() || {};
  console.log('配置已加载:', config);

  // 绑定事件监听
  document.getElementById('parse-btn').addEventListener('click', handleParse);
  document.getElementById('write-btn').addEventListener('click', handleWriteToAnki);

  // TODO: 根据配置和状态初始化UI
  // TODO: 实现国际化加载
}

/**
 * 处理解析按钮点击事件
 */
async function handleParse() {
  const textInput = document.getElementById('text-input').value;
  if (!textInput.trim()) {
    updateStatus('请输入内容后再解析', 'error');
    return;
  }

  // 更新UI为“解析中”状态
  setUiLoading(true, '解析中...');

  try {
    // 优先使用自定义prompt，否则使用默认prompt
    const customPrompt = config?.promptTemplates?.custom;
    // 注意：默认prompt应该与ai-service.js中的一致，或从统一位置获取
    const defaultPrompt = "请将以下单词查询结果解析为结构化数据..."; 
    const prompt = customPrompt || defaultPrompt;
    
    const result = await parseText(textInput, prompt);

    // 更新结果预览区域
    document.getElementById('front-input').value = result.front || '';
    document.getElementById('back-input').value = result.back || '';

    // 更新UI为“解析完成”状态
    document.getElementById('write-btn').disabled = false;
    updateStatus('解析成功，请确认后写入。', 'success');
  } catch (error) {
    console.error('解析失败:', error);
    updateStatus(`解析失败: ${error.message}`, 'error');
  } finally {
    // 恢复UI
    setUiLoading(false);
  }
}

/**
 * 处理写入Anki按钮点击事件
 */
async function handleWriteToAnki() {
  const front = document.getElementById('front-input').value;
  const back = document.getElementById('back-input').value;

  if (!front || !back) {
    updateStatus('卡片正面和背面不能为空', 'error');
    return;
  }

  // 更新UI为“写入中”状态
  setUiLoading(true, '正在写入 Anki...');
  document.getElementById('write-btn').disabled = true;

  try {
    // 从配置中获取牌组、模型等信息，并提供默认值
    const deckName = config?.ankiConfig?.defaultDeck || 'Default';
    const modelName = config?.ankiConfig?.defaultModel || 'Basic';
    const tags = config?.ankiConfig?.defaultTags || [];

    const noteData = {
      deckName: deckName,
      modelName: modelName,
      fields: { Front: front, Back: back },
      tags: tags
    };
    
    const result = await addNote(noteData);
    if (result.error) {
      throw new Error(result.error);
    }
    updateStatus(`成功创建卡片 (ID: ${result.result})`, 'success');
  } catch (error) {
    console.error('写入 Anki 失败:', error);
    updateStatus(`写入失败: ${error.message}`, 'error');
  } finally {
    setUiLoading(false);
    document.getElementById('write-btn').disabled = false;
  }
}

/**
 * 更新UI加载状态
 * @param {boolean} isLoading 是否正在加载
 * @param {string} [message=''] 加载时显示的消息
 */
function setUiLoading(isLoading, message = '') {
  document.getElementById('parse-btn').disabled = isLoading;
  document.getElementById('write-btn').disabled = isLoading;
  // TODO: 实现更明显的加载指示器，例如一个spinner
  updateStatus(message, 'loading');
}

/**
 * 更新状态消息
 * @param {string} message - 要显示的消息
 * @param {'success'|'error'|'loading'|''} type - 消息类型
 */
function updateStatus(message, type = '') {
  const statusElement = document.getElementById('status-message');
  statusElement.textContent = message;
  statusElement.className = `status-${type}`;
}
