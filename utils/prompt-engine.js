// prompt-engine.js - Prompt引擎与一体化解析流程
// 实现统一查询+解析的AI调用流程，支持动态字段输出

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
  if (customTemplate && customTemplate.trim() &&
      !customTemplate.includes('{{INPUT_TEXT}}') &&
      !customTemplate.includes('{{FIELD_SCHEMA}}')) {
    // 对于完全自定义的prompt，直接在末尾追加用户输入
    return `${customTemplate}\n-------------------------------\n以下是本次输入的内容：${userInput}`;
  }

  // 生成动态字段schema（用于占位符模式）
  const fieldSchema = generateFieldSchema(fieldNames);

  // 替换模板变量
  let prompt = defaultTemplate
    .replace(/\{\{INPUT_TEXT\}\}/g, userInput)
    .replace(/\{\{FIELD_SCHEMA\}\}/g, fieldSchema)
    .replace(/\{\{AVAILABLE_FIELDS\}\}/g, fieldNames.map((f) => `"${f}"`).join(", "));

  // 添加JSON格式强制约束（仅用于默认模板）
  prompt += `\n\n要求:\n- 输出有效JSON格式\n- 只能使用字段: ${fieldNames.join(", ")}\n- 可部分输出，但字段名必须准确`;

  return prompt;
}

/**
 * 获取默认的一体化模板
 * @returns {string} - 默认prompt模板
 */
function getDefaultIntegratedTemplate() {
  return `# Role: 专业单词查询助手

请完成以下任务：
1. 查询单词/短语: "{{INPUT_TEXT}}"
2. 生成详细解析信息
3. 按以下JSON格式输出：
{{FIELD_SCHEMA}}

要求：
- 输出纯JSON格式，不包含任何解释文字
- 根据单词/短语的特点，填充相应字段
- 如果某个字段不适用，可以不输出该字段`;
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
    if (field.toLowerCase().includes("word") || field.toLowerCase().includes("front")) {
      schema[field] = "单词本身";
    } else if (field.toLowerCase().includes("reading") || field.toLowerCase().includes("pronunciation")) {
      schema[field] = "读音/音标";
    } else if (field.toLowerCase().includes("meaning") || field.toLowerCase().includes("definition")) {
      schema[field] = "释义和解释";
    } else {
      schema[field] = `${field}相关内容`;
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
    const parsed = typeof aiOutput === "string" ? JSON.parse(aiOutput) : aiOutput;
    const outputFields = Object.keys(parsed);

    // 检查是否有无效字段
    const invalidFields = outputFields.filter((field) => !expectedFields.includes(field));

    return {
      isValid: invalidFields.length === 0,
      parsedData: parsed,
      invalidFields,
      validFields: outputFields.filter((field) => expectedFields.includes(field)),
      hasContent: outputFields.some((field) => parsed[field] && parsed[field].trim()),
    };
  } catch (error) {
    return {
      isValid: false,
      error: `JSON解析失败: ${error.message}`,
      parsedData: null,
    };
  }
}

/**
 * 创建一个空的 Prompt 配置对象
 * @returns {{selectedFields: string[], fieldConfigs: Record<string, {content: string}>, customPrompt: string}}
 */
export function createEmptyPromptTemplateConfig() {
  return {
    selectedFields: [],
    fieldConfigs: {},
    customPrompt: "",
  };
}

/**
 * 深拷贝 Prompt 配置对象
 * @param {{selectedFields: string[], fieldConfigs: Record<string, {content: string}>, customPrompt: string}} config
 * @returns {{selectedFields: string[], fieldConfigs: Record<string, {content: string}>, customPrompt: string}}
 */
function clonePromptTemplateConfig(config) {
  const cloned = createEmptyPromptTemplateConfig();
  cloned.selectedFields = Array.isArray(config?.selectedFields)
    ? [...config.selectedFields]
    : [];
  cloned.fieldConfigs = {};
  if (config?.fieldConfigs && typeof config.fieldConfigs === "object" && !Array.isArray(config.fieldConfigs)) {
    Object.keys(config.fieldConfigs).forEach((fieldName) => {
      const fieldConfig = config.fieldConfigs[fieldName];
      if (!fieldConfig || typeof fieldConfig !== "object" || Array.isArray(fieldConfig)) {
        return;
      }
      cloned.fieldConfigs[fieldName] = {
        content: typeof fieldConfig.content === "string" ? fieldConfig.content : "",
      };
    });
  }
  cloned.customPrompt = typeof config?.customPrompt === "string" ? config.customPrompt : "";
  return cloned;
}

/**
 * 标准化 Prompt 配置对象，兼容旧格式
 * @param {unknown} entry
 * @returns {{selectedFields: string[], fieldConfigs: Record<string, {content: string}>, customPrompt: string}}
 */
export function normalizePromptTemplateConfig(entry) {
  if (typeof entry === "string") {
    const config = createEmptyPromptTemplateConfig();
    config.customPrompt = entry;
    return config;
  }

  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return createEmptyPromptTemplateConfig();
  }

  const normalized = createEmptyPromptTemplateConfig();

  if (Array.isArray(entry.selectedFields)) {
    normalized.selectedFields = entry.selectedFields
      .filter((field) => typeof field === "string" && field.trim())
      .map((field) => field.trim());
  }

  if (entry.fieldConfigs && typeof entry.fieldConfigs === "object" && !Array.isArray(entry.fieldConfigs)) {
    const fieldConfigs = {};
    Object.keys(entry.fieldConfigs).forEach((fieldName) => {
      const fieldConfig = entry.fieldConfigs[fieldName];
      if (!fieldConfig || typeof fieldConfig !== "object" || Array.isArray(fieldConfig)) {
        return;
      }
      fieldConfigs[fieldName] = {
        content: typeof fieldConfig.content === "string" ? fieldConfig.content : "",
      };
    });
    normalized.fieldConfigs = fieldConfigs;
  }

  if (typeof entry.customPrompt === "string") {
    normalized.customPrompt = entry.customPrompt;
  }

  return normalized;
}

/**
 * 获取指定模型的 Prompt 配置（深拷贝）
 * @param {string} modelName
 * @param {object} config
 * @returns {{selectedFields: string[], fieldConfigs: Record<string, {content: string}>, customPrompt: string}}
 */
export function getPromptConfigForModel(modelName, config) {
  if (!modelName || !config) {
    return createEmptyPromptTemplateConfig();
  }

  const candidate =
    config?.promptTemplates?.promptTemplatesByModel?.[modelName] ??
    config?.ankiConfig?.promptTemplatesByModel?.[modelName];

  if (candidate === undefined || candidate === null) {
    return createEmptyPromptTemplateConfig();
  }

  return clonePromptTemplateConfig(normalizePromptTemplateConfig(candidate));
}

/**
 * 更新指定模型的 Prompt 配置
 * @param {string} modelName
 * @param {object} partialConfig
 * @param {object} config
 * @returns {{selectedFields: string[], fieldConfigs: Record<string, {content: string}>, customPrompt: string}}
 */
export function updatePromptConfigForModel(modelName, partialConfig, config) {
  if (!config) {
    return createEmptyPromptTemplateConfig();
  }

  if (!config.promptTemplates) {
    config.promptTemplates = {};
  }
  if (!config.promptTemplates.promptTemplatesByModel) {
    config.promptTemplates.promptTemplatesByModel = {};
  }

  const current = getPromptConfigForModel(modelName, config);
  const next = clonePromptTemplateConfig(current);

  if (partialConfig && Array.isArray(partialConfig.selectedFields)) {
    next.selectedFields = partialConfig.selectedFields
      .filter((field) => typeof field === "string" && field.trim())
      .map((field) => field.trim());
  }

  if (partialConfig && Object.prototype.hasOwnProperty.call(partialConfig, "fieldConfigs")) {
    next.fieldConfigs = {};
    if (
      partialConfig.fieldConfigs &&
      typeof partialConfig.fieldConfigs === "object" &&
      !Array.isArray(partialConfig.fieldConfigs)
    ) {
      Object.keys(partialConfig.fieldConfigs).forEach((fieldName) => {
        const fieldConfig = partialConfig.fieldConfigs[fieldName];
        if (!fieldConfig || typeof fieldConfig !== "object" || Array.isArray(fieldConfig)) {
          return;
        }
        next.fieldConfigs[fieldName] = {
          content: typeof fieldConfig.content === "string" ? fieldConfig.content : "",
        };
      });
    }
  }

  if (partialConfig && Object.prototype.hasOwnProperty.call(partialConfig, "customPrompt")) {
    next.customPrompt =
      typeof partialConfig.customPrompt === "string" ? partialConfig.customPrompt : "";
  }

  config.promptTemplates.promptTemplatesByModel[modelName] = clonePromptTemplateConfig(next);

  if (config.ankiConfig?.promptTemplatesByModel?.[modelName]) {
    delete config.ankiConfig.promptTemplatesByModel[modelName];
  }

  return clonePromptTemplateConfig(next);
}

/**
 * 从配置中加载指定模型的prompt
 * @param {string} modelName - 模型名称
 * @param {object} config - 配置对象
 * @returns {string} - prompt模板
 */
export function loadPromptForModel(modelName, config) {
  const promptConfig = getPromptConfigForModel(modelName, config);
  const customPrompt = promptConfig.customPrompt;

  if (typeof customPrompt === "string" && customPrompt.trim()) {
    return customPrompt;
  }

  const legacyPrompt = typeof config?.promptTemplates?.custom === "string"
    ? config.promptTemplates.custom
    : "";

  return legacyPrompt || "";
}

/**
 * 保存指定模型的prompt到配置
 * @param {string} modelName - 模型名称
 * @param {string} prompt - prompt模板
 * @param {object} config - 配置对象
 * @returns {object} - 更新后的配置
 */
export function savePromptForModel(modelName, prompt, config) {
  return updatePromptConfigForModel(modelName, { customPrompt: prompt }, config);
}


