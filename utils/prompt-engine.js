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

  // 生成动态字段schema
  const fieldSchema = generateFieldSchema(fieldNames);

  // 替换模板变量
  let prompt = defaultTemplate
    .replace(/\{\{INPUT_TEXT\}\}/g, userInput)
    .replace(/\{\{FIELD_SCHEMA\}\}/g, fieldSchema)
    .replace(/\{\{AVAILABLE_FIELDS\}\}/g, fieldNames.map(f => `"${f}"`).join(', '));

  // 添加JSON格式强制约束
  prompt += `\n\nCRITICAL要求:\n- 输出有效JSON格式\n- 只能使用字段: ${fieldNames.join(', ')}\n- 可部分输出，但字段名必须准确`;

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
  fieldNames.forEach(field => {
    // 根据字段名提供智能提示
    if (field.toLowerCase().includes('word') || field.toLowerCase().includes('front')) {
      schema[field] = "单词本身";
    } else if (field.toLowerCase().includes('reading') || field.toLowerCase().includes('pronunciation')) {
      schema[field] = "读音/音标";
    } else if (field.toLowerCase().includes('meaning') || field.toLowerCase().includes('definition')) {
      schema[field] = "释义和解释";
    } else if (field.toLowerCase().includes('example')) {
      schema[field] = "使用例句";
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
    const parsed = typeof aiOutput === 'string' ? JSON.parse(aiOutput) : aiOutput;
    const outputFields = Object.keys(parsed);

    // 检查是否有无效字段
    const invalidFields = outputFields.filter(field => !expectedFields.includes(field));

    return {
      isValid: invalidFields.length === 0,
      parsedData: parsed,
      invalidFields,
      validFields: outputFields.filter(field => expectedFields.includes(field)),
      hasContent: outputFields.some(field => parsed[field] && parsed[field].trim())
    };
  } catch (error) {
    return {
      isValid: false,
      error: `JSON解析失败: ${error.message}`,
      parsedData: null
    };
  }
}

/**
 * 从配置中加载指定模型的prompt
 * @param {string} modelName - 模型名称
 * @param {object} config - 配置对象
 * @returns {string} - prompt模板
 */
export function loadPromptForModel(modelName, config) {
  return config?.ankiConfig?.promptTemplatesByModel?.[modelName]
    || config?.promptTemplates?.promptTemplatesByModel?.[modelName]
    || config?.promptTemplates?.custom
    || '';
}

/**
 * 保存指定模型的prompt到配置
 * @param {string} modelName - 模型名称
 * @param {string} prompt - prompt模板
 * @param {object} config - 配置对象
 * @returns {object} - 更新后的配置
 */
export function savePromptForModel(modelName, prompt, config) {
  // 确保必要的对象结构存在
  if (!config.ankiConfig) {
    config.ankiConfig = {};
  }
  if (!config.ankiConfig.promptTemplatesByModel) {
    config.ankiConfig.promptTemplatesByModel = {};
  }
  if (!config.promptTemplates) {
    config.promptTemplates = {};
  }
  if (!config.promptTemplates.promptTemplatesByModel) {
    config.promptTemplates.promptTemplatesByModel = {};
  }

  // 保存到两个位置以确保兼容性
  config.ankiConfig.promptTemplatesByModel[modelName] = prompt;
  config.promptTemplates.promptTemplatesByModel[modelName] = prompt;

  return config;
}

/**
 * 验证prompt模板是否包含必要的占位符
 * @param {string} template - prompt模板
 * @returns {boolean} - 是否有效
 */
export function validatePromptTemplate(template) {
  return template && template.includes('{{INPUT_TEXT}}');
}

/**
 * 修复无效的prompt模板（自动添加缺失的占位符）
 * @param {string} template - 原始模板
 * @returns {string} - 修复后的模板
 */
export function fixPromptTemplate(template) {
  if (!template) {
    return getDefaultIntegratedTemplate();
  }

  if (!template.includes('{{INPUT_TEXT}}')) {
    // 自动在末尾添加用户输入
    template += '\n\n用户输入的文本: "{{INPUT_TEXT}}"';
  }

  return template;
}