// ai-service.js - AI 服务统一接口
// 目前只实现 Gemini, 但为其他服务预留了结构

import { loadConfig } from './storage.js';

const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

/**
 * 使用 AI 服务解析文本
 * @param {string} inputText - 用户输入的原始文本
 * @param {string} promptTemplate - 用于指导 AI 的 Prompt 模板
 * @returns {Promise<{front: string, back: string}>} - 解析后的结构化数据
 */
export async function parseText(inputText, promptTemplate) {
  const config = await loadConfig();
  const apiKey = config?.aiConfig?.models?.gemini?.apiKey;

  if (!apiKey) {
    throw new Error('未配置 Gemini API Key');
  }

  const fullPrompt = buildPrompt(inputText, promptTemplate);

  const response = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{ "text": fullPrompt }]
      }],
      generationConfig: {
        "response_mime_type": "application/json",
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error("AI API Error:", errorBody);
    throw new Error(`AI 服务请求失败: ${response.status}`);
  }

  const data = await response.json();
  
  // Gemini 返回的 JSON 内容在 text 字段中，是一个字符串，需要再次解析
  const jsonText = data.candidates[0].content.parts[0].text;
  return JSON.parse(jsonText);
}

/**
 * 测试 AI 服务连接
 * @param {string} apiKey - 用于测试的 API Key
 * @returns {Promise<void>} - 如果连接成功则 resolve, 否则 reject
 */
export async function testConnection(apiKey) {
  // 构造一个非常简单的请求来验证 key 的有效性
  const testUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash?key=${apiKey}`;
  const response = await fetch(testUrl, { method: 'GET' });

  if (!response.ok) {
    throw new Error(`API Key 无效或网络错误 (状态: ${response.status})`);
  }
  // 如果请求成功，说明 key 至少是有效的
}

/**
 * 构建完整的 Prompt
 * @param {string} inputText - 用户输入的文本
 * @param {string} template - Prompt 模板
 * @returns {string} - 结合了模板和输入文本的完整 Prompt
 */
export function buildPrompt(inputText, template) {
  // 这是一个简单的实现，可以根据需要扩展
  // 例如，可以加入更复杂的模板替换逻辑
  const jsonFormatInstruction = `
请将以下单词查询结果解析为结构化数据。
你的输出必须是一个纯粹的JSON对象，不要包含任何解释性文字或代码块标记。
JSON格式如下:
{
  "front": "单词",
  "back": "完整的单词查询结果（保留原始换行格式）"
}

待解析的文本如下：
---
${inputText}
---
`;
  return jsonFormatInstruction;
}
