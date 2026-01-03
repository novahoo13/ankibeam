// anki-service.js
// 统一的 Anki 业务逻辑服务
// 负责处理字段收集、验证、样式包装和写入

import { addNote } from "../utils/ankiconnect.js";
import { wrapContentWithStyle } from "../utils/formatter.js";
import { validateFields } from "../utils/field-handler.js";
import { getActiveTemplate } from "../utils/template-store.js";
import { translate } from "../utils/i18n.js";

const getText = (key, fallback, substitutions) =>
	translate(key, { fallback, substitutions });

/**
 * 创建详细错误的辅助函数
 */
const createDetailedError = (key, fallback, detail, substitutions) => {
	const message = getText(key, fallback, substitutions);
	const err = new Error(detail ? `${message}: ${detail}` : message);
	err.detail = detail;
	return err;
};

/**
 * 收集字段内容的纯函数
 * @param {object} rawCollectedFields - 如果是 content script，直接传入 collectFields() 的结果
 * @param {object|null} domSource - 如果是 popup，传入 DOM 查找逻辑 (暂不实现，popup 仍保留部分 DOM 逻辑)
 * @returns {object} 标准化的字段数据
 */
// 暂时我们假设 popup 和 content script 都在调用前完成了 "原始数据收集"
// 或者，我们可以将 collectFieldsForWrite 从 field-handler 移过来

/**
 * 核心：处理写入 Anki 的完整流程
 * @param {object} params 参数对像
 * @param {object} params.rawFields - 原始字段键值对 { FieldName: "Value" }
 * @param {object} params.config - 全局配置对象
 * @param {object} params.activeTemplate - 当前活动模板 (可选，不传则从 config 获取)
 * @param {function} [params.onWarning] - 警告回调 (warning) => void
 * @returns {Promise<object>} Result { noteId, fieldsCount }
 */
export async function writeToAnki({
	rawFields,
	config,
	activeTemplate = null,
	onWarning = () => {},
}) {
	// 1. 准备配置
	const template = activeTemplate || getActiveTemplate(config);

	if (!template) {
		throw createDetailedError("popup_status_no_template", "未选择解析模板");
	}

	const templateFieldNames = template.fields.map((f) => f.name);
	if (templateFieldNames.length === 0) {
		throw createDetailedError(
			"popup_status_no_fields_write",
			"当前模板未配置可写入的字段",
		);
	}

	// 2. 验证字段 (Validation)
	// 构造 field-handler 期望的格式
	const rawCollected = {
		fields: rawFields,
		collectedFields: Object.keys(rawFields).filter(
			(k) => rawFields[k] && rawFields[k].trim(),
		),
		emptyFields: Object.keys(rawFields).filter(
			(k) => !rawFields[k] || !rawFields[k].trim(),
		),
		mode: "dynamic",
	};

	const validation = validateFields(
		rawFields,
		false, // isLegacyMode
		rawCollected,
	);

	if (!validation.isValid) {
		let errorMessage = validation.message;
		if (validation.warnings.length > 0) {
			const warningsText = validation.warnings.join(", ");
			errorMessage += ` (警告: ${warningsText})`;
		}
		throw createDetailedError(
			"popup_status_validation_failed",
			"字段验证失败",
			errorMessage,
		);
	}

	// 处理警告
	if (validation.warnings.length > 0) {
		const warningMsg = validation.warnings.join(", ");
		if (onWarning) {
			// 等待警告确认（如果 onWarning 是 async，这里也要 await）
			await onWarning(warningMsg);
		}
	}

	// 3. 样式包装 (Formatting)
	const styleConfig = config?.styleConfig || {};
	const finalFields = {};

	// 只处理模板中定义的字段
	templateFieldNames.forEach((fieldName) => {
		const rawValue = rawFields[fieldName];
		// 只有非空值才进行包装，或者Anki允许空值？Anki允许空值。
		// 但为了保持一致性：
		if (rawValue && rawValue.trim()) {
			finalFields[fieldName] = wrapContentWithStyle(rawValue, styleConfig);
		} else {
			// 显式设置为空字符串可能更好
			finalFields[fieldName] = "";
		}
	});

	// 4. 最终检查 (Pre-flight check)
	const filledFieldCount = Object.values(finalFields).filter(
		(value) => value && value.trim().length > 0, // 包装后的HTML肯定有长度，但这里主要看内容
	).length;
	// 由于 wrapping 会增加 HTML 标签，简单的 trim check 可能不够准确，但如果 rawValue 是空的，finalFields[name] 也是空的（上面逻辑）。
	// 如果 rawValue 有值，finalFields[name] 也有值。
	// 所以再次检查 filledFieldCount 其实是检查 rawFields 是否全空。

	// Better check:
	const hasContent = Object.values(rawFields).some((v) => v && v.trim());

	if (!hasContent) {
		throw createDetailedError(
			"popup_status_no_fillable_fields",
			"没有可写入的字段内容",
		);
	}

	// 5. 构建 Note 数据
	const deckName =
		template.deckName || config?.ankiConfig?.defaultDeck || "Default";
	const modelName =
		template.modelName || config?.ankiConfig?.defaultModel || "Basic";
	const tags = config?.ankiConfig?.defaultTags || [];

	const noteData = {
		deckName,
		modelName,
		fields: finalFields,
		tags,
	};

	// 6. 调用 API
	const result = await addNote(noteData);

	if (result.error) {
		throw new Error(result.error);
	}

	return {
		noteId: result.result,
		fieldsCount: filledFieldCount,
		mode: "dynamic",
	};
}
