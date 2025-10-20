// popup.js - Chrome扩展弹出窗口主文件
// 功能: 处理用户输入文本的AI解析和Anki卡片创建的完整UI流程

import {
  parseTextWithFallback,
  parseTextWithDynamicFieldsFallback,
} from "../utils/ai-service.js";
import { addNote, getModelFieldNames } from "../utils/ankiconnect.js";
import { loadConfig } from "../utils/storage.js";
import {
  isLegacyMode,
  collectFieldsForWrite,
  validateFields,
} from "../utils/field-handler.js";
import { getPromptConfigForModel } from "../utils/prompt-engine.js";
import {
  translate,
  createI18nError,
  localizePage,
  whenI18nReady,
} from "../utils/i18n.js";

const getText = (key, fallback, substitutions) =>
  translate(key, { fallback, substitutions });

const createDetailedError = (key, fallback, detail, substitutions) => {
  const err = createI18nError(key, { fallback, substitutions });
  if (detail) {
    const base = (err.message || "").trimEnd();
    const hasSuffix = /[：:]\s*$/.test(base);
    const separator = hasSuffix ? " " : ": ";
    err.message = detail ? `${base}${separator}${detail}`.trim() : base;
    err.detail = detail;
  }
  return err;
};




// 全局配置对象（初始化后保存用户配置）
let config = {};

// 状态消息定时器（用于自动清除状态提示）
let statusTimer = null;

/**
 * 获取当前激活的提示设置和字段配置
 * 根据用户配置确定要使用的AI模型、字段列表和提示模板
 * @returns {object} 包含模型名、全部字段、选中字段和提示配置的对象
 */
function getActivePromptSetup() {
  // 获取当前模板的所有可用字段
  const allFields = Array.isArray(config?.ankiConfig?.modelFields)
    ? [...config.ankiConfig.modelFields]
    : [];

  // 获取默认的Anki模板名称
  let modelName = config?.ankiConfig?.defaultModel || "";

  // 获取提示模板配置，如果没有指定模型则使用第一个可用的
  const promptTemplates = config?.promptTemplates?.promptTemplatesByModel || {};
  if (!modelName && Object.keys(promptTemplates).length > 0) {
    modelName = Object.keys(promptTemplates)[0];
  }

  // 获取特定模型的提示配置和选中的字段
  const promptConfig = getPromptConfigForModel(modelName, config);
  let selectedFields = Array.isArray(promptConfig.selectedFields)
    ? promptConfig.selectedFields.filter(
        (field) => typeof field === "string" && field.trim()
      )
    : [];

  // 确保选中的字段存在于全部字段列表中
  if (selectedFields.length > 0 && allFields.length > 0) {
    selectedFields = selectedFields.filter((field) =>
      allFields.includes(field)
    );
  }

  // 如果没有选中的字段，则使用全部字段作为默认
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
/**
 * 错误边界管理器
 * 负责全局错误处理、用户友好提示和错误恢复机制
 * 提供频繁错误检测、自动重试和UI状态恢复功能
 */
class ErrorBoundary {
  constructor() {
    this.errorCount = 0; // 错误总计数
    this.lastErrorTime = 0; // 最后一次错误时间戳
    this.errorHistory = []; // 错误历史记录
    this.maxErrors = 5; // 最大错误阈值
    this.resetInterval = 30000; // 错误计数重置间隔（30秒）
  }

  /**
   * 统一错误处理入口
   * 记录错误、生成用户友好提示、提供重试机制
   * @param {Error} error - 捕获的错误对象
   * @param {string} context - 错误发生的业务上下文（如'parse'、'anki'、'config'等）
   * @param {object} options - 处理选项（是否允许重试、重试回调等）
   */
  async handleError(error, context = "unknown", options = {}) {
    this.errorCount++;
    this.lastErrorTime = Date.now();

    const timestamp = new Date().toISOString();
    const userMessage = this.getUserFriendlyMessage(error, context);
    const errorType = this.getErrorType(error, context);

    // 记录错误到历史列表中，包含完整的上下文信息
    this.errorHistory.push({
      error: error.message,
      context,
      userMessage,
      detail: typeof error.detail === "string" ? error.detail : null,
      timestamp,
      stack: error.stack,
    });

    // 限制错误历史数量，避免内存泄漏
    if (this.errorHistory.length > 10) {
      this.errorHistory = this.errorHistory.slice(-10);
    }

    console.error(`[${context}] エラー:`, error);

    // 频繁错误保护：如果短时间内错误过多，显示严重错误提示
    if (this.isFrequentError()) {
      this.showCriticalError(getText("popup_error_rate_limit", "检测到频繁错误，建议刷新页面或检查网络连接"));
      return;
    }

    // 在UI中显示错误消息
    updateStatus(userMessage, errorType);

    // 重置UI到可用状态，确保用户可以继续操作
    this.resetUIState();

    // 对于可恢复的错误，延迟提供重试选项
    if (options.allowRetry && this.isRetryableError(error, context)) {
      setTimeout(() => {
        this.showRetryOption(context, options.retryCallback);
      }, 2000);
    }
  }

  /**
   * 频繁错误检测
   * 统计指定时间窗口内的错误数量，判断是否超过阈值
   * @returns {boolean} 是否为频繁错误
   */
  isFrequentError() {
    const recentErrors = this.errorHistory.filter(
      (e) => Date.now() - new Date(e.timestamp).getTime() < this.resetInterval
    );
    return recentErrors.length >= this.maxErrors;
  }

  /**
   * 错误消息本地化处理
   * 将技术错误转换为用户友好的中文提示
   * @param {Error} error - 原始错误对象
   * @param {string} context - 错误业务上下文
   * @returns {string} 用户友好的错误消息
   */
  getUserFriendlyMessage(error, context) {
    const message = error.message || error.toString();

    // 识别并处理网络连接问题
    if (this.isNetworkError(error)) {
      return getText("popup_error_network", "网络连接失败，请检查网络后重试");
    }

    // AI解析服务相关错误的详细分类处理
    if (context === "parse" || context === "ai") {
      if (message.includes("API Key")) {
        return getText("popup_error_ai_config", "AI服务配置错误，请检查设置页面的API Key");
      }
      if (message.includes("quota") || message.includes("limit")) {
        return getText("popup_error_ai_quota", "AI服务额度不足，请检查账户状态或更换服务商");
      }
      if (message.includes("JSON解析失败")) {
        return getText("popup_error_ai_format_retry", "AI解析格式错误，正在自动重试...");
      }
      if (message.includes("输出包含无效字段")) {
        return getText("popup_error_ai_field_mismatch", "AI输出字段不匹配，请检查模板配置");
      }
      const simplified = this.simplifyErrorMessage(message);
      return getText("popup_error_ai_generic", `AI解析失败: ${simplified}`, [simplified]);
    }

    // AnkiConnect连接和操作相关错误处理
    if (context === "anki") {
      if (message.includes("Failed to fetch") || message.includes("未启动")) {
        return getText("popup_error_anki_launch", "请启动Anki并确保AnkiConnect插件已安装");
      }
      if (message.includes("duplicate") || message.includes("重复")) {
        return getText("popup_error_anki_duplicate", "卡片内容重复，请修改后重试");
      }
      if (message.includes("deck") && message.includes("not found")) {
        return getText("popup_error_anki_deck_missing", "指定的牌组不存在，请检查配置");
      }
      if (message.includes("model") && message.includes("not found")) {
        return getText("popup_error_anki_model_missing", "指定的模板不存在，请检查配置");
      }
      const simplifiedAnki = this.simplifyErrorMessage(message);
      return getText("popup_error_anki_generic", `Anki操作失败: ${simplifiedAnki}`, [simplifiedAnki]);
    }

    // 用户配置加载失败的处理
    if (context === "config") {
      return getText("popup_error_config_fallback", "配置加载异常，已使用默认配置");
    }

    // UI字段操作和验证相关错误
    if (context === "fields") {
      if (message.includes("找不到")) {
        return getText("popup_error_dom_missing", "页面元素缺失，请刷新页面重试");
      }
      if (message.includes("字段为空")) {
        return getText("popup_error_field_minimum", "请至少填写一个字段内容");
      }
      const simplifiedField = this.simplifyErrorMessage(message);
      return getText("popup_error_field_generic", `字段处理错误: ${simplifiedField}`, [simplifiedField]);
    }

    // 未分类错误的通用处理
    const simplifiedGeneric = this.simplifyErrorMessage(message);
    return getText("popup_error_generic", `操作失败: ${simplifiedGeneric}`, [simplifiedGeneric]);
  }

  /**
   * 错误消息简化处理
   * 移除技术性前缀，截断过长内容，提高可读性
   * @param {string} message - 原始错误消息
   * @returns {string} 简化后的错误消息
   */
  simplifyErrorMessage(message) {
    // 移除JavaScript错误类型前缀，提高用户可读性
    message = message.replace(/^(Error:|TypeError:|ReferenceError:)\s*/i, "");

    // 限制错误消息长度，避免UI显示问题
    if (message.length > 100) {
      message = message.substring(0, 100) + "...";
    }

    return message;
  }

  /**
   * 错误严重程度分类
   * 根据错误类型和上下文确定UI显示样式
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   * @returns {string} 错误类型（'error', 'warning'）
   */
  getErrorType(error, context) {
    if (this.isNetworkError(error)) {
      return "warning";
    }

    if (context === "parse" && error.message.includes("JSON解析失败")) {
      return "warning"; // JSON错误通常可以重试
    }

    if (context === "anki" && error.message.includes("重复")) {
      return "warning"; // 重复内容不是严重错误
    }

    return "error";
  }

  /**
   * 网络错误识别
   * 通过关键词匹配识别网络相关问题
   * @param {Error} error - 错误对象
   * @returns {boolean} 是否为网络错误
   */
  isNetworkError(error) {
    const message = error.message.toLowerCase();
    return (
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("timeout") ||
      message.includes("connection")
    );
  }

  /**
   * 可重试错误判断
   * 确定哪些错误类型适合提供重试选项
   * @param {Error} error - 错误对象
   * @param {string} context - 错误上下文
   * @returns {boolean} 是否可以重试
   */
  isRetryableError(error, context) {
    if (this.isNetworkError(error)) return true;

    if (context === "parse" && error.message.includes("JSON解析失败")) {
      return true;
    }

    if (context === "anki" && error.message.includes("timeout")) {
      return true;
    }

    return false;
  }

  /**
   * UI状态恢复
   * 确保按钮状态和加载提示回到正常状态
   */
  resetUIState() {
    // 重新启用操作按钮，确保用户可以继续使用
    const parseBtn = document.getElementById("parse-btn");
    const writeBtn = document.getElementById("write-btn");

    if (parseBtn) parseBtn.disabled = false;
    if (writeBtn) writeBtn.disabled = false;

    // 清除加载动画和禁用状态
    setUiLoading(false);
  }

  /**
   * 重试选项提示
   * 通过确认对话框询问用户是否重试操作
   * @param {string} context - 错误上下文
   * @param {Function} retryCallback - 重试时执行的回调函数
   */
  showRetryOption(context, retryCallback) {
    if (!retryCallback) return;

    const retryMessage = this.getRetryMessage(context);
    const retryPrompt = getText("popup_confirm_retry", `${retryMessage}\n\n是否立即重试？`, [retryMessage]);
    if (confirm(retryPrompt)) {
      retryCallback();
    }
  }

  /**
   * 重试消息生成
   * 根据不同的业务上下文生成适当的重试提示
   * @param {string} context - 错误上下文
   * @returns {string} 重试提示消息
   */
  getRetryMessage(context) {
    switch (context) {
      case "parse":
      case "ai":
        return getText("popup_hint_parse_network", "解析失败可能是临时网络问题");
      case "anki":
        return getText("popup_hint_anki_connection", "Anki操作失败可能是连接问题");
      default:
        return getText("popup_hint_retry_general", "操作失败可能是临时问题");
    }
  }

  /**
   * 严重错误处理
   * 显示严重错误提示并询问是否刷新页面
   * @param {string} message - 错误消息
   */
  showCriticalError(message) {
    updateStatus(message, "error");

    // 延迟显示页面刷新建议，给用户思考时间
    setTimeout(() => {
      const reloadPrompt = getText("popup_confirm_reload", `${message}\n\n点击确定刷新页面，取消继续使用`, [message]);
      if (confirm(reloadPrompt)) {
        window.location.reload();
      }
    }, 1000);
  }

  /**
   * 错误统计数据
   * 用于调试和监控错误发生频率
   * @returns {object} 包含各种错误统计的对象
   */
  getErrorStats() {
    const recentErrors = this.errorHistory.filter(
      (e) => Date.now() - new Date(e.timestamp).getTime() < this.resetInterval
    );

    return {
      totalErrors: this.errorHistory.length,
      recentErrors: recentErrors.length,
      lastErrorTime: this.lastErrorTime,
      errorRate: recentErrors.length / (this.resetInterval / 1000),
    };
  }

  /**
   * 错误历史清理
   * 重置所有错误统计数据
   */
  clearErrorHistory() {
    this.errorHistory = [];
    this.errorCount = 0;
    this.lastErrorTime = 0;
  }
}

// 全局错误边界实例，处理整个弹出窗口的错误
const errorBoundary = new ErrorBoundary();

// DOM加载完成后启动应用初始化
document.addEventListener("DOMContentLoaded", async () => {
  // 执行应用程序初始化：加载配置、注册事件监听器
  await whenI18nReady();
  initialize();
});

/**
 * 应用程序初始化
 * 加载用户配置、注册事件处理器、初始化动态字段显示
 */
async function initialize() {
  try {
    // 从chrome.storage加载用户配置，供全局使用
    config = (await loadConfig()) || {};
    console.log(getText("popup_status_config_loaded", "用户配置加载完成:"), config);

    // 重新本地化页面，确保静态元素使用用户配置的语言
    localizePage();

    // 注册主要功能按钮的点击事件处理器
    document.getElementById("parse-btn").addEventListener("click", handleParse);
    document
      .getElementById("write-btn")
      .addEventListener("click", handleWriteToAnki);

    // 根据配置渲染字段输入框（Legacy模式或Dynamic模式）
    await initializeDynamicFields();

    // 向用户显示应用已准备就绪
    updateStatus(getText("popup_status_ready", "准备就绪"), "success");
  } catch (error) {
    await errorBoundary.handleError(error, "config", {
      allowRetry: true,
      retryCallback: () => initialize(),
    });
  }
}

/**
 * AI解析按钮事件处理器
 * 处理用户输入的文本，调用AI服务进行解析，并填充到对应字段中
 */
async function handleParse() {
  // 获取用户输入的待解析文本
  const textInput = document.getElementById("text-input").value;
  if (!textInput.trim()) {
    updateStatus(getText("popup_status_input_required", "请输入要解析的文本"), "error");
    return;
  }

  // 显示加载状态，禁用按钮防止重复提交
  setUiLoading(true, getText("popup_status_parsing", "正在进行AI解析..."));

  try {
    // 获取当前配置的模型字段
    const modelFields = config?.ankiConfig?.modelFields;
    let result;

    // 根据配置选择解析模式
    if (isLegacyMode(config)) {
      // Legacy模式：使用固定的Front/Back字段结构
      result = await parseTextWithFallback(textInput);
      fillLegacyFields(result);
    } else {
      // Dynamic模式：根据用户配置的字段进行动态解析
      const { modelName, selectedFields, allFields } = getActivePromptSetup();
      const dynamicFields =
        selectedFields && selectedFields.length > 0
          ? selectedFields
          : Array.isArray(modelFields) && modelFields.length > 0
          ? modelFields
          : allFields;
      // 验证字段配置，确保有可用的解析目标
      if (!dynamicFields || dynamicFields.length === 0) {
        throw createI18nError("popup_status_no_fields_parse", { fallback: "当前模板未配置可解析的字段，请在选项页完成设置。" });
      }

      // 获取自定义提示模板并执行AI解析
      const customTemplate = getPromptConfigForModel(
        modelName,
        config
      ).customPrompt;
      result = await parseTextWithDynamicFieldsFallback(
        textInput,
        dynamicFields,
        customTemplate
      );
      // 将解析结果填充到动态字段中
      fillDynamicFields(result, dynamicFields);
    }

    // 解析成功后启用写入按钮，允许用户将内容保存到Anki
    document.getElementById("write-btn").disabled = false;
    updateStatus(getText("popup_status_parsed", "解析完成"), "success");
  } catch (error) {
    await errorBoundary.handleError(error, "parse", {
      allowRetry: true,
      retryCallback: () => handleParse(),
    });
  } finally {
    // 无论成功失败都要清除加载状态
    setUiLoading(false);
  }
}

/**
 * Anki写入按钮事件处理器
 * 收集字段内容、验证数据完整性、调用AnkiConnect API创建新卡片
 * 支持Legacy模式和Dynamic模式的不同字段处理逻辑
 */
async function handleWriteToAnki() {
  // 显示写入中状态，禁用按钮防止重复提交
  setUiLoading(true, getText("popup_status_writing", "正在写入 Anki..."));
  document.getElementById("write-btn").disabled = true;

  try {
    // 准备字段配置：根据模式确定要写入的字段列表
    const modelFields = config?.ankiConfig?.modelFields;
    const isLegacy = isLegacyMode(config);
    const { selectedFields, allFields } = getActivePromptSetup();
    const dynamicFields =
      selectedFields && selectedFields.length > 0
        ? selectedFields
        : Array.isArray(modelFields) && !isLegacy
        ? modelFields
        : allFields;

    // Dynamic模式必须有字段配置，否则无法写入
    if (!isLegacy && (!dynamicFields || dynamicFields.length === 0)) {
      throw createI18nError("popup_status_no_fields_write", { fallback: "当前模板未配置可写入的字段，请在选项页完成设置。" });
    }

    // 确定最终要处理的字段列表
    const targetFields = isLegacy ? modelFields : dynamicFields;

    // 第一步：收集字段原始内容用于验证（不带HTML样式）
    const rawCollectResult = collectFieldsForWrite(targetFields);

    // 字段收集过程的错误检查
    if (rawCollectResult.error) {
      const collectDetail = rawCollectResult.errors.join(', ');
      throw createDetailedError("popup_status_collect_failed", "字段收集失败:", collectDetail);
    }

    // 第二步：验证字段内容的完整性和有效性
    const validation = validateFields(
      rawCollectResult.fields,
      isLegacy,
      rawCollectResult
    );

    // 验证失败时显示详细错误信息并终止写入
    if (!validation.isValid) {
      let errorMessage = validation.message;
      if (validation.warnings.length > 0) {
        const warningsText = validation.warnings.join(', ');
        errorMessage += `\n${getText("popup_warning_prefix", `警告: ${warningsText}`, [warningsText])}`;
      }
      throw createDetailedError("popup_status_validation_failed", "字段验证失败:", errorMessage);
    }

    // 处理验证警告：显示提示但不阻止写入操作
    if (validation.warnings.length > 0) {
      console.warn(getText("popup_status_validation_warning_header", "字段验证警告:"), validation.warnings);
      updateStatus(
        getText(
          "popup_status_validation_continue",
          `${validation.message}，继续写入...`,
          [validation.message]
        ),
        "warning"
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    // 第三步：收集带HTML样式包装的字段内容用于实际写入
    const styledCollectResult = collectFieldsForWrite(
      targetFields,
      wrapContentWithStyle
    );

    // 样式包装过程的错误检查
    if (styledCollectResult.error) {
      const styleErrorDetail = styledCollectResult.errors.join(', ');
      throw createDetailedError("popup_status_style_error", "样式包装失败:", styleErrorDetail);
    }

    // 第四步：构建Anki API所需的字段数据结构
    const fields = {};

    if (isLegacy) {
      // Legacy模式：处理传统的双字段结构（正面/背面）
      const fieldNames =
        modelFields && modelFields.length >= 2
          ? modelFields
          : ["Front", "Back"];
      const styledFields = styledCollectResult.fields;

      // 只包含非空字段到最终数据中
      if (styledFields[fieldNames[0]] && styledFields[fieldNames[0]].trim()) {
        fields[fieldNames[0]] = styledFields[fieldNames[0]];
      }
      if (styledFields[fieldNames[1]] && styledFields[fieldNames[1]].trim()) {
        fields[fieldNames[1]] = styledFields[fieldNames[1]];
      }
    } else {
      // Dynamic模式：处理用户自定义的多字段结构
      Object.keys(styledCollectResult.fields).forEach((fieldName) => {
        const rawValue = rawCollectResult.fields[fieldName];
        const styledValue = styledCollectResult.fields[fieldName];

        // 基于原始值判断是否有内容，避免HTML标签干扰
        if (rawValue && rawValue.trim()) {
          fields[fieldName] = styledValue;
        }
      });

      // 为Anki模型的所有字段提供空值，防止缺失字段错误
      (allFields || []).forEach((fieldName) => {
        if (!(fieldName in fields)) {
          fields[fieldName] = "";
        }
      });
    }

    // 最终验证：确保有实际内容可以写入Anki
    const filledFieldCount = Object.values(fields).filter(
      (value) => typeof value === "string" && value.trim()
    ).length;
    const payloadFieldCount = Object.keys(fields).length;
    if (filledFieldCount === 0) {
      throw createI18nError("popup_status_no_fillable_fields", { fallback: "没有可写入的字段内容" });
    }

    // 从配置中获取Anki卡片的基本属性
    const deckName = config?.ankiConfig?.defaultDeck || "Default";
    const modelName = config?.ankiConfig?.defaultModel || "Basic";
    const tags = config?.ankiConfig?.defaultTags || [];

    // 构建AnkiConnect API所需的完整笔记数据
    const noteData = {
      deckName: deckName,
      modelName: modelName,
      fields: fields,
      tags: tags,
    };

    // 记录写入操作的详细信息用于调试
    console.log(getText("popup_status_ready_to_write", "准备写入Anki:"), {
      mode: isLegacy ? "legacy" : "dynamic",
      totalFields: rawCollectResult.totalFields,
      collectedFields: rawCollectResult.collectedFields,
      finalFields: filledFieldCount,
      payloadFields: payloadFieldCount,
      validation: validation.isValid,
      warnings: validation.warnings.length,
      noteData,
    });

    // 调用AnkiConnect API执行实际写入操作
    const result = await addNote(noteData);
    if (result.error) {
      throw new Error(result.error);
    }

    // 显示成功消息并触发自定义事件
    updateStatus(getText("popup_status_write_success", "写入成功"), "success");

    // 发布写入成功事件，供其他模块监听
    const event = new CustomEvent("ankiWriteSuccess", {
      detail: {
        noteId: result.result,
        fieldsCount: filledFieldCount,
        mode: isLegacy ? "legacy" : "dynamic",
      },
    });
    document.dispatchEvent(event);
  } catch (error) {
    await errorBoundary.handleError(error, "anki", {
      allowRetry: true,
      retryCallback: () => handleWriteToAnki(),
    });

    // 发布写入失败事件，供错误监控使用
    const event = new CustomEvent("ankiWriteError", {
      detail: {
        error: error.message,
        timestamp: new Date().toISOString(),
      },
    });
    document.dispatchEvent(event);
  } finally {
    // 无论成功失败都要恢复UI状态
    setUiLoading(false);
    document.getElementById("write-btn").disabled = false;
  }
}

/**
 * 字段界面初始化
 * 根据用户配置决定渲染Legacy模式还是Dynamic模式的字段输入界面
 * 包含错误处理和回退机制
 */
async function initializeDynamicFields() {
  try {
    // 获取当前激活的字段配置
    const { selectedFields, allFields } = getActivePromptSetup();
    const modelFields = config?.ankiConfig?.modelFields;

    // 根据配置模式渲染不同的字段界面
    if (isLegacyMode(config)) {
      // Legacy模式：渲染传统的双字段界面
      renderLegacyFields();
    } else {
      // Dynamic模式：渲染用户配置的多字段界面
      const fieldsToRender =
        selectedFields && selectedFields.length > 0
          ? selectedFields
          : Array.isArray(modelFields)
          ? modelFields
          : allFields;
      if (!fieldsToRender || fieldsToRender.length === 0) {
        throw createI18nError("popup_status_no_configured_fields", { fallback: "当前模板未配置字段，请在选项页完成配置。" });
      }
      renderDynamicFields(fieldsToRender);
    }
  } catch (error) {
    await errorBoundary.handleError(error, "fields");
    // 出错时回退到Legacy模式作为最后手段
    try {
      renderLegacyFields();
    } catch (fallbackError) {
      const legacyFallbackMessage = getText("popup_status_legacy_fallback_failed", "回退到legacy模式也失败:", [fallbackError?.message ?? String(fallbackError)]);
      console.error(legacyFallbackMessage, fallbackError);
    }
  }
}

/**
 * Legacy模式字段渲染
 * 创建固定的Front/Back双字段输入界面
 */
function renderLegacyFields() {
  const container = document.getElementById("fields-container");
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
 * Dynamic模式字段渲染
 * 根据提供的字段名数组创建对应的输入控件
 * @param {string[]} fieldNames - 要渲染的字段名数组
 */

function renderDynamicFields(fieldNames) {
  // 获取字段容器元素
  const container = document.getElementById("fields-container");
  if (!container) {
    return;
  }

  // 字段名验证：如果没有有效字段则显示提示信息
  if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
    const emptyFieldsHint = getText("popup_dynamic_fields_missing", "当前未配置可填充的字段，请先在选项页完成字段配置。");
    container.innerHTML = `<div class="text-xs text-gray-500 border border-dashed border-slate-300 rounded-md p-3 bg-slate-50">${emptyFieldsHint}</div>`;
    return;
  }

  // 为每个字段生成对应的HTML输入元素
  const fieldPlaceholder = getText("popup_dynamic_field_placeholder", "AI将自动填充此字段...");
  const fieldsHtml = fieldNames
    .map((fieldName, index) => {
      const inputId = `field-${index}`;

      return `
			<div class="form-group">
				<label for="${inputId}" class="block text-sm font-medium text-gray-700 mb-1">${fieldName}:</label>
				<textarea
					id="${inputId}"
					rows="1"
					placeholder="${fieldPlaceholder}"
					data-i18n-placeholder="popup_dynamic_field_placeholder"
					class="auto-resize-textarea w-full p-2 border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-slate-500 text-sm"
				></textarea>
			</div>
		`;
    })
    .join("");

  // 将生成的HTML注入到容器中
  container.innerHTML = fieldsHtml;
  localizePage();

  // 为新创建的文本框添加自适应高度功能
  setupAutoResizeTextareas();
}

/**
 * Legacy模式字段填充
 * 将AI解析的结果填入Front和Back字段，并应用状态样式
 * @param {object} result - AI解析结果对象，包含front和back字段
 */
function fillLegacyFields(result) {
  // 获取Legacy模式的两个固定字段元素
  const frontInput = document.getElementById("front-input");
  const backInput = document.getElementById("back-input");

  // 填入AI解析的内容，空值则使用空字符串
  frontInput.value = result.front || "";
  backInput.value = result.back || "";

  // 根据内容状态添加视觉样式反馈
  applyFieldStatusStyle(frontInput, result.front || "");
  applyFieldStatusStyle(backInput, result.back || "");
}

/**
 * 字段状态样式应用
 * 根据字段内容添加相应的CSS类名，提供视觉反馈
 * @param {HTMLElement} element - 要设置样式的字段元素
 * @param {string} value - 字段的文本内容
 */
function applyFieldStatusStyle(element, value) {
  // 清除之前的状态样式类
  element.classList.remove("filled", "partially-filled", "empty");

  const trimmedValue = value.trim();

  // 根据内容状态添加不同的样式类和提示信息
  if (trimmedValue) {
    element.classList.add("filled");
    const previewValue = trimmedValue.length > 20 ? `${trimmedValue.substring(0, 20)}...` : trimmedValue;
    element.title = getText("popup_field_preview", `已填充: ${previewValue}`, [previewValue]);
  } else {
    element.classList.add("empty");
    element.title = getText("popup_field_tag_pending_label", "待填充");
  }
}

/**
 * Dynamic模式字段填充器
 * 将AI解析结果填入对应的动态字段，包含完整的错误处理和统计反馈
 * 支持自动高度调整、状态样式和填充结果统计
 * @param {object} aiResult - AI返回的字段解析结果对象
 * @param {string[]} fieldNames - 需要填充的字段名数组
 * @returns {object} 包含填充统计信息的结果对象
 */
function fillDynamicFields(aiResult, fieldNames) {
  try {
    // 验证输入参数
    if (!aiResult || typeof aiResult !== "object") {
      throw createI18nError("popup_status_parse_result_empty", { fallback: "AI解析结果为空或格式无效" });
    }

    if (!Array.isArray(fieldNames) || fieldNames.length === 0) {
      throw createI18nError("popup_status_field_names_invalid", { fallback: "字段名数组为空或无效" });
    }

    let filledCount = 0;
    const filledFields = [];
    const emptyFields = [];
    const missingElements = [];

    fieldNames.forEach((fieldName, index) => {
      const inputId = `field-${index}`;
      const element = document.getElementById(inputId);

      if (!element) {
        console.warn(getText("popup_field_not_found", `找不到字段元素: ${inputId} (${fieldName})`, [inputId, fieldName]));
        missingElements.push(fieldName);
        return;
      }

      const value = aiResult[fieldName] || "";
      const trimmedValue = value.trim();

      // 设置字段值
      element.value = value;

      // 调整文本框高度（如果是自动调整的文本框）
      if (element.classList.contains("auto-resize-textarea")) {
        adjustTextareaHeight(element);
      }

      // 添加填充状态样式
      element.classList.remove("filled", "partially-filled", "empty");

      if (trimmedValue) {
        filledCount++;
        filledFields.push(fieldName);
        element.classList.add("filled");
      } else {
        emptyFields.push(fieldName);
        element.classList.add("empty");
      }

      // 添加工具提示
      element.title = trimmedValue
        ? getText("popup_field_tag_filled", `已填充: ${fieldName}`, [fieldName])
        : getText("popup_field_tag_pending", `待填充: ${fieldName}`, [fieldName]);
    });

    // 生成状态反馈
    const fillResult = {
      totalFields: fieldNames.length,
      filledCount,
      emptyCount: emptyFields.length,
      missingElements: missingElements.length,
      filledFields,
      emptyFields,
      fillRate: Math.round((filledCount / fieldNames.length) * 100),
    };

    // 显示详细状态信息
    let statusMessage = getText("popup_field_progress", `已填充 ${filledCount}/${fieldNames.length} 个字段`, [String(filledCount), String(fieldNames.length)]);
    let statusType = "success";

    if (filledCount === 0) {
      statusMessage = getText("popup_field_all_empty_warning", "警告：所有字段都为空，请检查AI解析结果");
      statusType = "error";
    } else if (filledCount < fieldNames.length) {
      statusMessage += ` ${getText("popup_field_empty_count", `(${emptyFields.length} 个字段为空)`, [String(emptyFields.length)])}`;
      statusType = "warning";
    }

    // 添加特殊情况提示
    if (missingElements.length > 0) {
      console.error(getText("popup_field_missing_dom_prefix", "缺失DOM元素:"), missingElements);
      statusMessage += ` ${getText("popup_field_missing_dom_summary", `[${missingElements.length} 个元素缺失]`, [String(missingElements.length)])}`;
      statusType = "error";
    }

    updateStatus(statusMessage, statusType);

    // 打印详细日志
    console.log(getText("popup_dynamic_fill_complete", "动态字段填充完成:"), {
      fillResult,
      aiResult,
      fieldNames,
    });

    // 触发字段变化事件，供其他模块监听
    const event = new CustomEvent("dynamicFieldsFilled", {
      detail: fillResult,
    });
    document.dispatchEvent(event);

    return fillResult;
  } catch (error) {
    console.error(getText("popup_dynamic_fill_error", "填充动态字段时发生错误:"), error);
    updateStatus(getText("popup_field_fill_failed", `字段填充失败: ${error.message}`, [error.message]), "error");

    // 返回错误状态
    return {
      error: true,
      message: error.message,
      totalFields: fieldNames ? fieldNames.length : 0,
      filledCount: 0,
    };
  }
}

/**
 * UI加载状态管理
 * 控制按钮的禁用状态和加载提示消息的显示
 * @param {boolean} isLoading 是否处于加载状态
 * @param {string} [message=''] 要显示的加载消息
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
 * 内容样式包装器
 * 将纯文本内容转换为带样式的HTML，用于在Anki中显示
 * @param {string} content - 原始文本内容
 * @returns {string} 包装后的HTML字符串
 */
function wrapContentWithStyle(content) {
  // 从配置中获取样式
  const styleConfig = config?.styleConfig || {};
  const fontSize = styleConfig.fontSize || "14px";
  const textAlign = styleConfig.textAlign || "left";
  const lineHeight = styleConfig.lineHeight || "1.4";

  // 将换行符转换成 <br>
  const contentWithBreaks = content.replace(/\n/g, "<br>");

  // 包装后返回
  return `<div style="font-size: ${fontSize}; text-align: ${textAlign}; line-height: ${lineHeight};">${contentWithBreaks}</div>`;
}

/**
 * 状态消息更新器
 * 在UI中显示状态信息，并根据类型自动设置清除定时器
 * @param {string} message - 要显示的消息文本
 * @param {'success'|'error'|'loading'|'warning'|''} type - 消息类型，影响样式和显示时长
 */
function updateStatus(message, type = "") {
  const statusElement = document.getElementById("status-message");
  statusElement.textContent = message;
  statusElement.className = `status-${type}`;

  // 清除现有计时器
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
 * 自适应文本框初始化
 * 为所有具有自适应类名的文本框添加高度自动调整功能
 */
function setupAutoResizeTextareas() {
  const textareas = document.querySelectorAll(".auto-resize-textarea");

  textareas.forEach((textarea) => {
    // 初始化高度
    adjustTextareaHeight(textarea);

    // 监听输入事件
    textarea.addEventListener("input", () => {
      adjustTextareaHeight(textarea);
    });

    // 监听粘贴事件
    textarea.addEventListener("paste", () => {
      setTimeout(() => {
        adjustTextareaHeight(textarea);
      }, 0);
    });
  });
}

/**
 * 文本框高度调整算法
 * 根据内容自动计算并设置合适的文本框高度，带最大高度限制
 * @param {HTMLTextAreaElement} textarea - 需要调整高度的文本框元素
 */
function adjustTextareaHeight(textarea) {
  // 重置高度以获取准确的scrollHeight
  textarea.style.height = "auto";

  // 计算所需高度
  const scrollHeight = textarea.scrollHeight;
  const lineHeight = parseInt(getComputedStyle(textarea).lineHeight) || 20;
  const padding =
    parseInt(getComputedStyle(textarea).paddingTop) +
    parseInt(getComputedStyle(textarea).paddingBottom);

  // 计算行数
  const lines = Math.ceil((scrollHeight - padding) / lineHeight);

  // 限制最大5行
  const maxLines = 5;
  const actualLines = Math.min(lines, maxLines);

  // 设置新高度
  const newHeight = Math.max(actualLines * lineHeight + padding, 40); // 最小高度40px
  textarea.style.height = newHeight + "px";

  // 如果内容超过5行，显示滚动条
  if (lines > maxLines) {
    textarea.style.overflowY = "auto";
  } else {
    textarea.style.overflowY = "hidden";
  }
}
