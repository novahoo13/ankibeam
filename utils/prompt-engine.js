// prompt-engine.js - Prompt引擎与一体化解析流程
// 实现统一查询+解析的AI调用流程，支持动态字段输出

import { translate } from "./i18n.js";

const getText = (key, fallback, substitutions) =>
	translate(key, { fallback, substitutions });

/**
 * 构建一体化prompt，整合查询和解析功能
 * @param {string} userInput - 用户输入的文本
 * @param {string[]} fieldNames - 字段名数组
 * @param {string} [customTemplate] - 自定义prompt模板
 * @returns {string} - 构建好的prompt
 */
export function buildIntegratedPrompt(userInput, fieldNames, customTemplate) {
	const defaultTemplate = customTemplate || getDefaultIntegratedTemplate();

	// 检查是否为自定义prompt（不使用占位符系统）
	if (
		customTemplate &&
		customTemplate.trim() &&
		!customTemplate.includes("{{INPUT_TEXT}}") &&
		!customTemplate.includes("{{FIELD_SCHEMA}}")
	) {
		// 对于完全自定义的prompt，直接在末尾追加用户输入
		return getText(
			"prompt_engine_custom_template_header",
			"$TEMPLATE$\n-------------------------------\n以下是本次输入的内容：$INPUT$",
			[customTemplate, userInput],
		);
	}

	// 生成动态字段schema（用于占位符模式）
	const fieldSchema = generateFieldSchema(fieldNames);

	// 替换模板变量
	let prompt = defaultTemplate
		.replace(/\{\{INPUT_TEXT\}\}/g, userInput)
		.replace(/\{\{FIELD_SCHEMA\}\}/g, fieldSchema)
		.replace(
			/\{\{AVAILABLE_FIELDS\}\}/g,
			fieldNames.map((f) => `"${f}"`).join(", "),
		);

	// 添加JSON格式强制约束（仅用于默认模板）
	prompt += getText(
		"prompt_engine_requirements_body",
		"\n\n要求:\n- 输出有效JSON格式\n- 只能使用字段: $FIELDS$\n- 可部分输出，但字段名必须准确",
		[fieldNames.join(", ")],
	);

	return prompt;
}

/**
 * 获取默认的一体化模板
 * @returns {string} - 默认prompt模板
 */
function getDefaultIntegratedTemplate() {
	return getText(
		"prompt_engine_default_header",
		`# Role: 专业单词查询助手

请完成以下任务：
1. 查询单词/短语: "{{INPUT_TEXT}}"
2. 生成详细解析信息
3. 按以下JSON格式输出：
{{FIELD_SCHEMA}}

要求：
- 输出纯JSON格式，不包含任何解释文字
- 根据单词/短语的特点，填充相应字段
- 如果某个字段不适用，可以不输出该字段`,
	);
}

/**
 * 生成字段schema
 * @param {string[]} fieldNames - 字段名数组
 * @returns {string} - JSON格式的字段schema
 */
function generateFieldSchema(fieldNames) {
	const schema = {};
	fieldNames.forEach((field) => {
		// 根据字段名提供智能提示
		if (
			field.toLowerCase().includes("word") ||
			field.toLowerCase().includes("front")
		) {
			schema[field] = getText("prompt_engine_schema_word", "单词本身");
		} else if (
			field.toLowerCase().includes("reading") ||
			field.toLowerCase().includes("pronunciation")
		) {
			schema[field] = getText("prompt_engine_schema_reading", "读音/音标");
		} else if (
			field.toLowerCase().includes("meaning") ||
			field.toLowerCase().includes("definition")
		) {
			schema[field] = getText("prompt_engine_schema_meaning", "释义和解释");
		} else {
			schema[field] = getText(
				"prompt_engine_field_prompt",
				`${field}相关内容`,
				[field],
			);
		}
	});
	return JSON.stringify(schema, null, 2);
}

/**
 * 验证AI输出结果
 * @param {string|object} aiOutput - AI的输出结果
 * @param {string[]} expectedFields - 期望的字段列表
 * @returns {object} - 验证结果
 */
export function validateAIOutput(aiOutput, expectedFields) {
	try {
		const parsed =
			typeof aiOutput === "string" ? JSON.parse(aiOutput) : aiOutput;
		const outputFields = Object.keys(parsed);

		// 检查是否有无效字段
		const invalidFields = outputFields.filter(
			(field) => !expectedFields.includes(field),
		);

		return {
			isValid: invalidFields.length === 0,
			parsedData: parsed,
			invalidFields,
			validFields: outputFields.filter((field) =>
				expectedFields.includes(field),
			),
			hasContent: outputFields.some(
				(field) => parsed[field] && parsed[field].trim(),
			),
		};
	} catch (error) {
		return {
			isValid: false,
			error: getText(
				"prompt_engine_error_json_parse",
				`JSON解析失败: ${error.message}`,
				[error.message],
			),
			parsedData: null,
		};
	}
}

/**
 * テンプレートからプロンプトを構築
 * テンプレートのフィールド定義を使用してAI用のプロンプトを生成する
 * @param {Object} template - テンプレートオブジェクト
 * @param {string} userInput - ユーザー入力テキスト
 * @returns {string} 構築されたプロンプト
 */
export function buildPromptFromTemplate(template, userInput) {
	if (!template || typeof template !== "object") {
		throw new Error("テンプレートオブジェクトが無効です");
	}

	if (!userInput || typeof userInput !== "string") {
		throw new Error("ユーザー入力が無効です");
	}

	// テンプレートにカスタムプロンプトがある場合はそれを使用
	if (
		template.prompt &&
		typeof template.prompt === "string" &&
		template.prompt.trim()
	) {
		return buildIntegratedPrompt(
			userInput,
			template.fields.map((f) => f.name),
			template.prompt,
		);
	}

	// カスタムプロンプトがない場合はデフォルトテンプレートを使用
	return buildIntegratedPrompt(
		userInput,
		template.fields.map((f) => f.name),
		null,
	);
}
