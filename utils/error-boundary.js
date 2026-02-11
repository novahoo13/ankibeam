// error-boundary.js
// 通用错误边界处理器，提取自 popup.js 并实现通用化
import { translate } from "./i18n.js";

const getText = (key, fallback, substitutions) =>
  translate(key, { fallback, substitutions });

export class ErrorBoundary {
  constructor() {
    this.errorCount = 0; // 错误总计数
    this.lastErrorTime = 0; // 最后一次错误时间戳
    this.errorHistory = []; // 错误历史记录
    this.maxErrors = 5; // 最大错误阈值
    this.resetInterval = 30000; // 错误计数重置间隔（30秒）

    // 默认的UI更新回调，可被覆盖
    this.onUpdateStatus = (message, type) => {};
    // console.log(`[Status:${type}] ${message}`);
    this.onResetUI = () => {};
    this.onShowRetry = (context, callback) => {};
    this.onCriticalError = (message) => alert(message);
  }

  /**
   * 配置UI交互回调
   * @param {object} callbacks UI交互回调函数集合
   */
  setCallbacks({ onUpdateStatus, onResetUI, onShowRetry, onCriticalError }) {
    if (onUpdateStatus) this.onUpdateStatus = onUpdateStatus;
    if (onResetUI) this.onResetUI = onResetUI;
    if (onShowRetry) this.onShowRetry = onShowRetry;
    if (onCriticalError) this.onCriticalError = onCriticalError;
  }

  /**
   * 统一错误处理入口
   * 记录错误、生成用户友好提示、提供重试机制
   * @param {Error} error - 捕获的错误对象
   * @param {string} context - 错误发生的业务上下文
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

    // 限制错误历史数量
    if (this.errorHistory.length > 10) {
      this.errorHistory = this.errorHistory.slice(-10);
    }

    console.error(`[${context}] Error:`, error);

    // 频繁错误保护
    if (this.isFrequentError()) {
      this.onCriticalError(
        getText(
          "popup_error_rate_limit",
          "检测到频繁错误，建议刷新页面或检查网络连接",
        ),
      );
      return;
    }

    // 在UI中显示错误消息
    this.onUpdateStatus(userMessage, errorType);

    // 重置UI到可用状态
    this.onResetUI();

    // 对于可恢复的错误，延迟提供重试选项
    if (options.allowRetry && this.isRetryableError(error, context)) {
      setTimeout(() => {
        this.onShowRetry(context, options.retryCallback);
      }, 2000);
    }
  }

  /**
   * 频繁错误检测
   */
  isFrequentError() {
    const recentErrors = this.errorHistory.filter(
      (e) => Date.now() - new Date(e.timestamp).getTime() < this.resetInterval,
    );
    return recentErrors.length >= this.maxErrors;
  }

  /**
   * 错误消息本地化处理
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
        return getText(
          "popup_error_ai_config",
          "AI服务配置错误，请检查设置页面的API Key",
        );
      }
      if (message.includes("quota") || message.includes("limit")) {
        return getText(
          "popup_error_ai_quota",
          "AI服务额度不足，请检查账户状态或更换服务商",
        );
      }
      if (message.includes("JSON解析失败")) {
        return getText(
          "popup_error_ai_format_retry",
          "AI解析格式错误，正在自动重试...",
        );
      }
      if (message.includes("输出包含无效字段")) {
        return getText(
          "popup_error_ai_field_mismatch",
          "AI输出字段不匹配，请检查模板配置",
        );
      }
      const simplified = this.simplifyErrorMessage(message);
      return getText("popup_error_ai_generic", `AI解析失败: ${simplified}`, [
        simplified,
      ]);
    }

    // AnkiConnect连接和操作相关错误处理
    if (context === "anki") {
      if (message.includes("Failed to fetch") || message.includes("未启动")) {
        return getText(
          "popup_error_anki_launch",
          "请启动Anki并确保AnkiConnect插件已安装",
        );
      }
      if (message.includes("duplicate") || message.includes("重复")) {
        return getText(
          "popup_error_anki_duplicate",
          "卡片内容重复，请修改后重试",
        );
      }
      if (message.includes("deck") && message.includes("not found")) {
        return getText(
          "popup_error_anki_deck_missing",
          "指定的牌组不存在，请检查配置",
        );
      }
      if (message.includes("model") && message.includes("not found")) {
        return getText(
          "popup_error_anki_model_missing",
          "指定的模板不存在，请检查配置",
        );
      }
      const simplifiedAnki = this.simplifyErrorMessage(message);
      return getText(
        "popup_error_anki_generic",
        `Anki操作失败: ${simplifiedAnki}`,
        [simplifiedAnki],
      );
    }

    // 用户配置加载失败的处理
    if (context === "config") {
      return getText(
        "popup_error_config_fallback",
        "配置加载异常，已使用默认配置",
      );
    }

    // UI字段操作和验证相关错误
    if (context === "fields") {
      if (message.includes("找不到")) {
        return getText(
          "popup_error_dom_missing",
          "页面元素缺失，请刷新页面重试",
        );
      }
      if (message.includes("字段为空")) {
        return getText("popup_error_field_minimum", "请至少填写一个字段内容");
      }
      const simplifiedField = this.simplifyErrorMessage(message);
      return getText(
        "popup_error_field_generic",
        `字段处理错误: ${simplifiedField}`,
        [simplifiedField],
      );
    }

    // 未分类错误的通用处理
    const simplifiedGeneric = this.simplifyErrorMessage(message);
    return getText("popup_error_generic", `操作失败: ${simplifiedGeneric}`, [
      simplifiedGeneric,
    ]);
  }

  /**
   * 错误消息简化处理
   */
  simplifyErrorMessage(message) {
    message = message.replace(/^(Error:|TypeError:|ReferenceError:)\s*/i, "");
    if (message.length > 100) {
      message = message.substring(0, 100) + "...";
    }
    return message;
  }

  /**
   * 错误严重程度分类
   */
  getErrorType(error, context) {
    if (this.isNetworkError(error)) {
      return "warning";
    }
    if (context === "parse" && error.message.includes("JSON解析失败")) {
      return "warning";
    }
    if (context === "anki" && error.message.includes("重复")) {
      return "warning";
    }
    return "error";
  }

  /**
   * 网络错误识别
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
   * 重试消息生成
   */
  getRetryMessage(context) {
    switch (context) {
      case "parse":
      case "ai":
        return getText(
          "popup_hint_parse_network",
          "解析失败可能是临时网络问题",
        );
      case "anki":
        return getText(
          "popup_hint_anki_connection",
          "Anki操作失败可能是连接问题",
        );
      default:
        return getText("popup_hint_retry_general", "操作失败可能是临时问题");
    }
  }
}
