// popup.js - ポップアップ画面
// 目的: 入力テキストの解析と結果表示のUI更新

import { parseText, parseTextWithFallback, parseTextWithDynamicFieldsFallback } from "../utils/ai-service.js";
import { addNote, getModelFieldNames } from "../utils/ankiconnect.js";
import { loadConfig } from "../utils/storage.js";
import {
  isLegacyMode,
  collectFieldsForWrite,
  validateFields
} from "../utils/field-handler.js";
import { getPromptConfigForModel } from "../utils/prompt-engine.js";
// import { i18n } from '../utils/i18n.js'; // 国際化（未使用）

// 現在の設定（ロード後に格納）
let config = {};

// ステータスメッセージのタイマー
let statusTimer = null;



function getActivePromptSetup() {
  const allFields = Array.isArray(config?.ankiConfig?.modelFields)
    ? [...config.ankiConfig.modelFields]
    : [];
  let modelName = config?.ankiConfig?.defaultModel || '';

  const promptTemplates = config?.promptTemplates?.promptTemplatesByModel || {};
  if (!modelName && Object.keys(promptTemplates).length > 0) {
    modelName = Object.keys(promptTemplates)[0];
  }

  const promptConfig = getPromptConfigForModel(modelName, config);
  let selectedFields = Array.isArray(promptConfig.selectedFields)
    ? promptConfig.selectedFields.filter((field) => typeof field === 'string' && field.trim())
    : [];

  if (selectedFields.length > 0 && allFields.length > 0) {
    selectedFields = selectedFields.filter((field) => allFields.includes(field));
  }

  if (selectedFields.length === 0) {
    selectedFields = allFields.slice();
  }

  return {
    modelName,
    allFields,
    selectedFields,
    promptConfig,
  };
}
// 错误边界管理器
class ErrorBoundary {
	constructor() {
		this.errorCount = 0;
		this.lastErrorTime = 0;
		this.errorHistory = [];
		this.maxErrors = 5;
		this.resetInterval = 30000; // 30秒
	}

	/**
	 * 处理错误并提供用户友好的反馈
	 * @param {Error} error - 错误对象
	 * @param {string} context - 错误上下文
	 * @param {object} options - 可选配置
	 */
	async handleError(error, context = 'unknown', options = {}) {
		this.errorCount++;
		this.lastErrorTime = Date.now();

		// 添加到错误历史
		this.errorHistory.push({
			error: error.message,
			context,
			timestamp: new Date().toISOString(),
			stack: error.stack
		});

		// 保持错误历史不超过10条
		if (this.errorHistory.length > 10) {
			this.errorHistory = this.errorHistory.slice(-10);
		}

		console.error(`[${context}] 错误:`, error);

		// 检查是否为频繁错误
		if (this.isFrequentError()) {
			this.showCriticalError('检测到频繁错误，建议刷新页面或检查网络连接');
			return;
		}

		// 根据错误类型和上下文生成用户友好的提示
		const userMessage = this.getUserFriendlyMessage(error, context);
		const errorType = this.getErrorType(error, context);

		// 显示错误信息
		updateStatus(userMessage, errorType);

		// 自动恢复UI状态
		this.resetUIState();

		// 如果是非关键错误，提供重试选项
		if (options.allowRetry && this.isRetryableError(error, context)) {
			setTimeout(() => {
				this.showRetryOption(context, options.retryCallback);
			}, 2000);
		}
	}

	/**
	 * 检查是否为频繁错误
	 */
	isFrequentError() {
		const recentErrors = this.errorHistory.filter(e =>
			Date.now() - new Date(e.timestamp).getTime() < this.resetInterval
		);
		return recentErrors.length >= this.maxErrors;
	}

	/**
	 * 生成用户友好的错误消息
	 */
	getUserFriendlyMessage(error, context) {
		const message = error.message || error.toString();

		// 网络相关错误
		if (this.isNetworkError(error)) {
			return '网络连接失败，请检查网络后重试';
		}

		// AI服务错误
		if (context === 'parse' || context === 'ai') {
			if (message.includes('API Key')) {
				return 'AI服务配置错误，请检查设置页面的API Key';
			}
			if (message.includes('quota') || message.includes('limit')) {
				return 'AI服务额度不足，请检查账户状态或更换服务商';
			}
			if (message.includes('JSON解析失败')) {
				return 'AI解析格式错误，正在自动重试...';
			}
			if (message.includes('输出包含无效字段')) {
				return 'AI输出字段不匹配，请检查模板配置';
			}
			return `AI解析失败: ${this.simplifyErrorMessage(message)}`;
		}

		// Anki相关错误
		if (context === 'anki') {
			if (message.includes('Failed to fetch') || message.includes('未启动')) {
				return '请启动Anki并确保AnkiConnect插件已安装';
			}
			if (message.includes('duplicate') || message.includes('重复')) {
				return '卡片内容重复，请修改后重试';
			}
			if (message.includes('deck') && message.includes('not found')) {
				return '指定的牌组不存在，请检查配置';
			}
			if (message.includes('model') && message.includes('not found')) {
				return '指定的模板不存在，请检查配置';
			}
			return `Anki操作失败: ${this.simplifyErrorMessage(message)}`;
		}

		// 配置相关错误
		if (context === 'config') {
			return '配置加载异常，已使用默认配置';
		}

		// 字段相关错误
		if (context === 'fields') {
			if (message.includes('找不到')) {
				return '页面元素缺失，请刷新页面重试';
			}
			if (message.includes('字段为空')) {
				return '请至少填写一个字段内容';
			}
			return `字段处理错误: ${this.simplifyErrorMessage(message)}`;
		}

		// 默认错误
		return `操作失败: ${this.simplifyErrorMessage(message)}`;
	}

	/**
	 * 简化错误消息
	 */
	simplifyErrorMessage(message) {
		// 移除技术性的错误前缀
		message = message.replace(/^(Error:|TypeError:|ReferenceError:)\s*/i, '');

		// 截断过长的消息
		if (message.length > 100) {
			message = message.substring(0, 100) + '...';
		}

		return message;
	}

	/**
	 * 确定错误类型
	 */
	getErrorType(error, context) {
		if (this.isNetworkError(error)) {
			return 'warning';
		}

		if (context === 'parse' && error.message.includes('JSON解析失败')) {
			return 'warning'; // JSON错误通常可以重试
		}

		if (context === 'anki' && error.message.includes('重复')) {
			return 'warning'; // 重复内容不是严重错误
		}

		return 'error';
	}

	/**
	 * 检查是否为网络错误
	 */
	isNetworkError(error) {
		const message = error.message.toLowerCase();
		return message.includes('fetch') ||
			   message.includes('network') ||
			   message.includes('timeout') ||
			   message.includes('connection');
	}

	/**
	 * 检查是否为可重试的错误
	 */
	isRetryableError(error, context) {
		if (this.isNetworkError(error)) return true;

		if (context === 'parse' && error.message.includes('JSON解析失败')) {
			return true;
		}

		if (context === 'anki' && error.message.includes('timeout')) {
			return true;
		}

		return false;
	}

	/**
	 * 重置UI状态
	 */
	resetUIState() {
		// 确保按钮状态正确
		const parseBtn = document.getElementById('parse-btn');
		const writeBtn = document.getElementById('write-btn');

		if (parseBtn) parseBtn.disabled = false;
		if (writeBtn) writeBtn.disabled = false;

		// 清除加载状态
		setUiLoading(false);
	}

	/**
	 * 显示重试选项
	 */
	showRetryOption(context, retryCallback) {
		if (!retryCallback) return;

		const retryMessage = this.getRetryMessage(context);
		if (confirm(`${retryMessage}\n\n是否立即重试？`)) {
			retryCallback();
		}
	}

	/**
	 * 获取重试消息
	 */
	getRetryMessage(context) {
		switch (context) {
			case 'parse':
			case 'ai':
				return '解析失败可能是临时网络问题';
			case 'anki':
				return 'Anki操作失败可能是连接问题';
			default:
				return '操作失败可能是临时问题';
		}
	}

	/**
	 * 显示关键错误
	 */
	showCriticalError(message) {
		updateStatus(message, 'error');

		// 显示重启建议
		setTimeout(() => {
			if (confirm(`${message}\n\n点击确定刷新页面，取消继续使用`)) {
				window.location.reload();
			}
		}, 1000);
	}

	/**
	 * 获取错误统计信息
	 */
	getErrorStats() {
		const recentErrors = this.errorHistory.filter(e =>
			Date.now() - new Date(e.timestamp).getTime() < this.resetInterval
		);

		return {
			totalErrors: this.errorHistory.length,
			recentErrors: recentErrors.length,
			lastErrorTime: this.lastErrorTime,
			errorRate: recentErrors.length / (this.resetInterval / 1000)
		};
	}

	/**
	 * 清除错误历史
	 */
	clearErrorHistory() {
		this.errorHistory = [];
		this.errorCount = 0;
		this.lastErrorTime = 0;
	}
}

// 全局错误边界实例
const errorBoundary = new ErrorBoundary();

document.addEventListener("DOMContentLoaded", () => {
	// 初期化: 設定ロードとイベント登録
	initialize();
});

/**
 * 初期化処理
 */
async function initialize() {
	try {
		// 設定をロードし、後続処理で使用する
		config = (await loadConfig()) || {};
		console.log("設定をロードしました:", config);

		// イベント登録
		document.getElementById("parse-btn").addEventListener("click", handleParse);
		document
			.getElementById("write-btn")
			.addEventListener("click", handleWriteToAnki);

		// 初始化动态字段显示
		await initializeDynamicFields();

		// 显示初始化成功状态
		updateStatus("准备就绪", "success");

	} catch (error) {
		await errorBoundary.handleError(error, 'config', {
			allowRetry: true,
			retryCallback: () => initialize()
		});
	}
}

/**
 * 解析ボタン ハンドラ
 */
async function handleParse() {
	const textInput = document.getElementById("text-input").value;
	if (!textInput.trim()) {
		updateStatus("请输入要解析的文本", "error");
		return;
	}

	// UI: ローディング表示
	setUiLoading(true, "正在进行AI解析...");

	try {
		const modelFields = config?.ankiConfig?.modelFields;
		let result;

		if (isLegacyMode(config)) {
			// Legacy模式：使用现有的解析逻辑
			result = await parseTextWithFallback(textInput);
			fillLegacyFields(result);
		} else {
			// Dynamic模式：使用动态字段解析
			const { modelName, selectedFields, allFields } = getActivePromptSetup();
			const dynamicFields = (selectedFields && selectedFields.length > 0)
				? selectedFields
				: (Array.isArray(modelFields) && modelFields.length > 0 ? modelFields : allFields);
			if (!dynamicFields || dynamicFields.length === 0) {
				throw new Error('当前模板未配置可解析的字段，请在选项页完成设置。');
			}

			const customTemplate = getPromptConfigForModel(modelName, config).customPrompt;
			result = await parseTextWithDynamicFieldsFallback(textInput, dynamicFields, customTemplate);
			fillDynamicFields(result, dynamicFields);
		}

		// UI: 書き込みボタン有効化
		document.getElementById("write-btn").disabled = false;
		updateStatus("解析完成", "success");
	} catch (error) {
		await errorBoundary.handleError(error, 'parse', {
			allowRetry: true,
			retryCallback: () => handleParse()
		});
	} finally {
		// UI: ローディング解除
		setUiLoading(false);
	}
}

/**
 * 写入到 Anki 按钮 ハンドラ
 */
async function handleWriteToAnki() {
	// UI: ローディング表示
	setUiLoading(true, "正在写入 Anki...");
	document.getElementById("write-btn").disabled = true;

	try {
		const modelFields = config?.ankiConfig?.modelFields;
		const isLegacy = isLegacyMode(config);
		const { selectedFields, allFields } = getActivePromptSetup();
		const dynamicFields = (selectedFields && selectedFields.length > 0)
			? selectedFields
			: (Array.isArray(modelFields) && !isLegacy ? modelFields : allFields);

		if (!isLegacy && (!dynamicFields || dynamicFields.length === 0)) {
			throw new Error('当前模板未配置可写入的字段，请在选项页完成设置。');
		}

		const targetFields = isLegacy ? modelFields : dynamicFields;

		// 第一步：收集原始字段内容（不包装样式）
		const rawCollectResult = collectFieldsForWrite(targetFields);

		// 检查收集过程是否有错误
		if (rawCollectResult.error) {
			throw new Error(`字段收集失败: ${rawCollectResult.errors.join(', ')}`);
		}

		// 第二步：验证字段内容
		const validation = validateFields(rawCollectResult.fields, isLegacy, rawCollectResult);

		if (!validation.isValid) {
			// 显示详细的验证错误信息
			let errorMessage = validation.message;
			if (validation.warnings.length > 0) {
				errorMessage += `\n警告: ${validation.warnings.join(', ')}`;
			}
			throw new Error(errorMessage);
		}

		// 显示验证警告（如果有的话）
		if (validation.warnings.length > 0) {
			console.warn('字段验证警告:', validation.warnings);
			// 在UI中短暂显示警告，但不阻止写入
			updateStatus(`${validation.message}，继续写入...`, 'warning');
			await new Promise(resolve => setTimeout(resolve, 1000));
		}

		// 第三步：收集包装样式的字段内容
		const styledCollectResult = collectFieldsForWrite(targetFields, wrapContentWithStyle);

		if (styledCollectResult.error) {
			throw new Error(`样式包装失败: ${styledCollectResult.errors.join(', ')}`);
		}

		// 第四步：构建最终的字段映射
		const fields = {};

		if (isLegacy) {
			// Legacy模式：使用配置的字段名或默认Front/Back
			const fieldNames = modelFields && modelFields.length >= 2 ? modelFields : ['Front', 'Back'];
			const styledFields = styledCollectResult.fields;

			// 确保字段存在且不为空
			if (styledFields[fieldNames[0]] && styledFields[fieldNames[0]].trim()) {
				fields[fieldNames[0]] = styledFields[fieldNames[0]];
			}
			if (styledFields[fieldNames[1]] && styledFields[fieldNames[1]].trim()) {
				fields[fieldNames[1]] = styledFields[fieldNames[1]];
			}
		} else {
			// Dynamic模式：只包含非空字段
			Object.keys(styledCollectResult.fields).forEach(fieldName => {
				const rawValue = rawCollectResult.fields[fieldName];
				const styledValue = styledCollectResult.fields[fieldName];

				if (rawValue && rawValue.trim()) {
					fields[fieldName] = styledValue;
				}
			});

			// 确保所有模型字段至少写入空字符串，避免Anki报错
			(allFields || []).forEach((fieldName) => {
				if (!(fieldName in fields)) {
					fields[fieldName] = '';
				}
			});
		}

		// 最终检查：确保至少有一个字段有内容
		const filledFieldCount = Object.values(fields).filter((value) =>
			typeof value === 'string' && value.trim()
		).length;
		const payloadFieldCount = Object.keys(fields).length;
		if (filledFieldCount === 0) {
			throw new Error('没有可写入的字段内容');
		}

		// 設定からデフォルト値を取得
		const deckName = config?.ankiConfig?.defaultDeck || "Default";
		const modelName = config?.ankiConfig?.defaultModel || "Basic";
		const tags = config?.ankiConfig?.defaultTags || [];

		const noteData = {
			deckName: deckName,
			modelName: modelName,
			fields: fields,
			tags: tags,
		};

		// 详细日志记录
		console.log('准备写入Anki:', {
			mode: isLegacy ? 'legacy' : 'dynamic',
			totalFields: rawCollectResult.totalFields,
			collectedFields: rawCollectResult.collectedFields,
			finalFields: filledFieldCount,
			payloadFields: payloadFieldCount,
			validation: validation.isValid,
			warnings: validation.warnings.length,
			noteData
		});

		const result = await addNote(noteData);
		if (result.error) {
			throw new Error(result.error);
		}

		updateStatus("写入成功", "success");

		// 触发写入成功事件
		const event = new CustomEvent('ankiWriteSuccess', {
			detail: {
				noteId: result.result,
				fieldsCount: filledFieldCount,
				mode: isLegacy ? 'legacy' : 'dynamic'
			}
		});
		document.dispatchEvent(event);

	} catch (error) {
		await errorBoundary.handleError(error, 'anki', {
			allowRetry: true,
			retryCallback: () => handleWriteToAnki()
		});

		// 触发写入失败事件
		const event = new CustomEvent('ankiWriteError', {
			detail: {
				error: error.message,
				timestamp: new Date().toISOString()
			}
		});
		document.dispatchEvent(event);

	} finally {
		setUiLoading(false);
		document.getElementById("write-btn").disabled = false;
	}
}

/**
 * 初始化动态字段显示
 */
async function initializeDynamicFields() {
	try {
		const { selectedFields, allFields } = getActivePromptSetup();
		const modelFields = config?.ankiConfig?.modelFields;

		if (isLegacyMode(config)) {
			// Legacy模式：使用现有的front/back字段
			renderLegacyFields();
		} else {
			const fieldsToRender = (selectedFields && selectedFields.length > 0)
				? selectedFields
				: (Array.isArray(modelFields) ? modelFields : allFields);
			if (!fieldsToRender || fieldsToRender.length === 0) {
				throw new Error('当前模板未配置字段，请在选项页完成配置。');
			}
			renderDynamicFields(fieldsToRender);
		}
	} catch (error) {
		await errorBoundary.handleError(error, 'fields');
		// 回退到legacy模式
		try {
			renderLegacyFields();
		} catch (fallbackError) {
			console.error('回退到legacy模式也失败:', fallbackError);
		}
	}
}

/**
 * 渲染传统模式字段
 */
function renderLegacyFields() {
	const container = document.getElementById('fields-container');
	container.innerHTML = `
		<div class="form-group">
			<label for="front-input" class="block text-sm font-medium text-gray-700 mb-1" data-i18n="cardFront">正面:</label>
			<input type="text" id="front-input" class="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-sm" />
		</div>
		<div class="form-group">
			<label for="back-input" class="block text-sm font-medium text-gray-700 mb-1" data-i18n="cardBack">背面:</label>
			<textarea id="back-input" rows="5" class="w-full p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-sm"></textarea>
		</div>
	`;
}

/**
 * 渲染动态字段
 * @param {string[]} fieldNames - 字段名数组
 */

function renderDynamicFields(fieldNames) {
	const container = document.getElementById('fields-container');

	if (!container) {
		return;
	}

	if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
		container.innerHTML = '<div class="text-xs text-gray-500 border border-dashed border-slate-300 rounded-md p-3 bg-slate-50">当前未配置可填充的字段，请先在选项页完成字段配置。</div>';
		return;
	}

	const fieldsHtml = fieldNames.map((fieldName, index) => {
		const inputId = `field-${index}`;

		return `
			<div class="form-group">
				<label for="${inputId}" class="block text-sm font-medium text-gray-700 mb-1">${fieldName}:</label>
				<textarea
					id="${inputId}"
					rows="1"
					placeholder="AI将自动填充此字段..."
					class="auto-resize-textarea w-full p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-sm"
				></textarea>
			</div>
		`;
	}).join('');

	container.innerHTML = fieldsHtml;

	// 为所有多行文本框添加动态高度功能
	setupAutoResizeTextareas();
}

/**
 * 填充传统模式字段
 * @param {object} result - AI解析结果 {front, back}
 */
function fillLegacyFields(result) {
	const frontInput = document.getElementById('front-input');
	const backInput = document.getElementById('back-input');

	// 设置字段值
	frontInput.value = result.front || '';
	backInput.value = result.back || '';

	// 应用状态样式，保持与动态字段一致
	applyFieldStatusStyle(frontInput, result.front || '');
	applyFieldStatusStyle(backInput, result.back || '');
}

/**
 * 为字段元素应用状态样式
 * @param {HTMLElement} element - 字段元素
 * @param {string} value - 字段值
 */
function applyFieldStatusStyle(element, value) {
	// 移除现有状态样式
	element.classList.remove('filled', 'partially-filled', 'empty');

	const trimmedValue = value.trim();

	if (trimmedValue) {
		element.classList.add('filled');
		// 检查内容长度，如果很短可能是部分填充
		if (trimmedValue.length <= 1) {
			element.classList.add('partially-filled');
		}
		element.title = `已填充: ${trimmedValue.substring(0, 20)}${trimmedValue.length > 20 ? '...' : ''}`;
	} else {
		element.classList.add('empty');
		element.title = '待填充';
	}
}

/**
 * 填充动态字段 (增强版本，包含错误处理和状态反馈)
 * @param {object} aiResult - AI解析结果对象
 * @param {string[]} fieldNames - 字段名数组
 * @returns {object} - 填充结果统计
 */
function fillDynamicFields(aiResult, fieldNames) {
	try {
		// 验证输入参数
		if (!aiResult || typeof aiResult !== 'object') {
			throw new Error('AI解析结果为空或格式无效');
		}

		if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
			throw new Error('字段名数组为空或无效');
		}

		let filledCount = 0;
		let partiallyFilledCount = 0;
		const filledFields = [];
		const emptyFields = [];
		const missingElements = [];

		fieldNames.forEach((fieldName, index) => {
			const inputId = `field-${index}`;
			const element = document.getElementById(inputId);

			if (!element) {
				console.warn(`找不到字段元素: ${inputId} (${fieldName})`);
				missingElements.push(fieldName);
				return;
			}

			const value = aiResult[fieldName] || '';
			const trimmedValue = value.trim();

			// 设置字段值
			element.value = value;

			// 调整文本框高度（如果是自动调整的文本框）
			if (element.classList.contains('auto-resize-textarea')) {
				adjustTextareaHeight(element);
			}

			// 添加填充状态样式
			element.classList.remove('filled', 'partially-filled', 'empty');

			if (trimmedValue) {
				filledCount++;
				filledFields.push(fieldName);
				element.classList.add('filled');

				// 检查内容长度，如果很短可能是部分填充
				if (trimmedValue.length <= 1) {
					partiallyFilledCount++;
					element.classList.add('partially-filled');
				}
			} else {
				emptyFields.push(fieldName);
				element.classList.add('empty');
			}

			// 添加工具提示
			element.title = trimmedValue ? `已填充: ${fieldName}` : `待填充: ${fieldName}`;
		});

		// 生成状态反馈
		const fillResult = {
			totalFields: fieldNames.length,
			filledCount,
			emptyCount: emptyFields.length,
			partiallyFilledCount,
			missingElements: missingElements.length,
			filledFields,
			emptyFields,
			fillRate: Math.round((filledCount / fieldNames.length) * 100)
		};

		// 显示详细状态信息
		let statusMessage = `已填充 ${filledCount}/${fieldNames.length} 个字段`;
		let statusType = 'success';

		if (filledCount === 0) {
			statusMessage = '警告：所有字段都为空，请检查AI解析结果';
			statusType = 'error';
		} else if (filledCount < fieldNames.length) {
			statusMessage += ` (${emptyFields.length} 个字段为空)`;
			statusType = 'warning';
		}

		// 添加特殊情况提示
		if (missingElements.length > 0) {
			console.error('缺失DOM元素:', missingElements);
			statusMessage += ` [${missingElements.length} 个元素缺失]`;
			statusType = 'error';
		}

		if (partiallyFilledCount > 0 && partiallyFilledCount === filledCount) {
			statusMessage += ' (内容可能不完整)';
		}

		updateStatus(statusMessage, statusType);

		// 打印详细日志
		console.log('动态字段填充完成:', {
			fillResult,
			aiResult,
			fieldNames
		});

		// 触发字段变化事件，供其他模块监听
		const event = new CustomEvent('dynamicFieldsFilled', {
			detail: fillResult
		});
		document.dispatchEvent(event);

		return fillResult;

	} catch (error) {
		console.error('填充动态字段时发生错误:', error);
		updateStatus(`字段填充失败: ${error.message}`, 'error');

		// 返回错误状态
		return {
			error: true,
			message: error.message,
			totalFields: fieldNames ? fieldNames.length : 0,
			filledCount: 0
		};
	}
}

/**
 * UI ローディング表示
 * @param {boolean} isLoading ローディング中か
 * @param {string} [message=''] ステータスメッセージ
 */
function setUiLoading(isLoading, message = "") {
	document.getElementById("parse-btn").disabled = isLoading;
	document.getElementById("write-btn").disabled = isLoading;

	// 只有在有消息内容时才更新状态，避免覆盖现有的成功/错误消息
	if (message || isLoading) {
		updateStatus(message, "loading");
	}
	// 如果是结束loading且没有消息，不更新状态，保留现有消息
}

/**
 * コンテンツを装飾して HTML に変換
 * @param {string} content - 元テキスト
 * @returns {string} - 装飾後の HTML
 */
function wrapContentWithStyle(content) {
	// 設定からスタイル取得
	const styleConfig = config?.styleConfig || {};
	const fontSize = styleConfig.fontSize || "14px";
	const textAlign = styleConfig.textAlign || "left";
	const lineHeight = styleConfig.lineHeight || "1.4";

	// 改行を <br> に変換
	const contentWithBreaks = content.replace(/\n/g, "<br>");

	// ラップして返す
	return `<div style="font-size: ${fontSize}; text-align: ${textAlign}; line-height: ${lineHeight};">${contentWithBreaks}</div>`;
}

/**
 * ステータス更新
 * @param {string} message - メッセージ
 * @param {'success'|'error'|'loading'|'warning'|''} type - 種別
 */
function updateStatus(message, type = "") {
	const statusElement = document.getElementById("status-message");
	statusElement.textContent = message;
	statusElement.className = `status-${type}`;

	// 既存タイマーをクリア
	if (statusTimer) {
		clearTimeout(statusTimer);
		statusTimer = null;
	}

	// 根据类型设置不同的显示时长
	let timeout = 0;
	switch (type) {
		case "success":
			timeout = 3000; // 成功消息显示3秒
			break;
		case "error":
			timeout = 5000; // 错误消息显示5秒
			break;
		case "warning":
			timeout = 4000; // 警告消息显示4秒
			break;
		default:
			timeout = 0; // loading等状态不自动消失
	}

	if (timeout > 0) {
		statusTimer = setTimeout(() => {
			statusElement.textContent = "";
			statusElement.className = "";
			statusTimer = null;
		}, timeout);
	}
}

/**
 * 设置自动调整高度的多行文本框
 */
function setupAutoResizeTextareas() {
	const textareas = document.querySelectorAll('.auto-resize-textarea');

	textareas.forEach(textarea => {
		// 初始化高度
		adjustTextareaHeight(textarea);

		// 监听输入事件
		textarea.addEventListener('input', () => {
			adjustTextareaHeight(textarea);
		});

		// 监听粘贴事件
		textarea.addEventListener('paste', () => {
			setTimeout(() => {
				adjustTextareaHeight(textarea);
			}, 0);
		});
	});
}

/**
 * 调整单个文本框的高度
 * @param {HTMLTextAreaElement} textarea - 文本框元素
 */
function adjustTextareaHeight(textarea) {
	// 重置高度以获取准确的scrollHeight
	textarea.style.height = 'auto';

	// 计算所需高度
	const scrollHeight = textarea.scrollHeight;
	const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
	const padding = parseInt(getComputedStyle(textarea).paddingTop) + parseInt(getComputedStyle(textarea).paddingBottom);

	// 计算行数
	const lines = Math.ceil((scrollHeight - padding) / lineHeight);

	// 限制最大5行
	const maxLines = 5;
	const actualLines = Math.min(lines, maxLines);

	// 设置新高度
	const newHeight = Math.max(actualLines * lineHeight + padding, 40); // 最小高度40px
	textarea.style.height = newHeight + 'px';

	// 如果内容超过5行，显示滚动条
	if (lines > maxLines) {
		textarea.style.overflowY = 'auto';
	} else {
		textarea.style.overflowY = 'hidden';
	}
}


