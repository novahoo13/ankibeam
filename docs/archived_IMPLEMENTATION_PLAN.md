## Stage 0: 基础重构与向后兼容准备

**Goal**: 在不破坏现有功能前提下，重构核心模块为可扩展架构，确保平滑升级路径。
**Success Criteria**:

- 抽取现有`popup.js`中的字段处理逻辑为独立模块`utils/field-handler.js`
- 建立配置版本管理机制，实现从 v2.0 到 v2.1 的平滑迁移
- 重构`popup.html`结构，将固定字段区域改为动态容器，但保持现有样式不变
- 确保现有 front/back 双字段模式 100%兼容，作为默认回退方案
  **调整与约束**:
- 本阶段重点是“保存/回显一致性与错误处理验证”，Deck/Model 拉取已由 options 的 `loadAnkiData()` 覆盖，无需重复实现。
- DOM 命名沿用现有 options 元素：`#default-model` 与 `#field-mapping`，避免新增不一致 id（如 `#model-select`）。
- 写入时统一收集动态字段；当 `modelFields <= 2` 时回退使用 legacy 的 front/back 输入。
  ```javascript
  // popup: 根据 modelFields 生成写入所需的 fields
  function collectFieldsForWrite(modelFields) {
    // legacy 兜底
    if (!modelFields || modelFields.length <= 2) {
      const front = document.getElementById("front-input")?.value || "";
      const back = document.getElementById("back-input")?.value || "";
      return {
        Front: wrapContentWithStyle(front),
        Back: wrapContentWithStyle(back),
      };
    }
    // dynamic 路径
    const fields = {};
    modelFields.forEach((name, idx) => {
      const el = document.getElementById(`field-${idx}`);
      fields[name] = wrapContentWithStyle(el ? el.value || "" : "");
    });
    return fields;
  }
  ```
  **Implementation Details**:
- **新增模块**: `utils/field-handler.js`

  ```javascript
  export function isLegacyMode(config) {
    return (
      !config?.ankiConfig?.modelFields?.length ||
      config.ankiConfig.modelFields.length <= 2
    );
  }

  export function getLegacyFieldMapping() {
    return { front: "front-input", back: "back-input" };
  }

  export function getDynamicFieldMapping(modelFields) {
    return modelFields.reduce((mapping, field, index) => {
      mapping[field] = `field-${index}`;
      return mapping;
    }, {});
  }
  ```

- **配置迁移**: 扩展`utils/storage.js`的`migrateConfig()`函数
  ```javascript
  // 在现有migrateConfig基础上添加v2.1支持
  if (oldConfig.version === "2.0") {
    newConfig.version = "2.1";
    // 保持现有配置不变，添加新字段
    newConfig.ankiConfig.promptTemplatesByModel = {};
    newConfig.ui = { fieldDisplayMode: "auto" }; // auto|legacy|dynamic
  }
  ```
- **UI 准备**: 修改`popup.html`结构
  ```html
  <!-- 替换原有固定字段区域 -->
  <div id="fields-container" class="result-section">
    <!-- 动态字段将在这里渲染，默认渲染legacy模式 -->
  </div>
  ```
  **Tests**:
- 所有现有功能（解析、写入 Anki）保持完全一致的行为
- 新安装的扩展默认使用 legacy 模式（front/back 两字段）
- 配置迁移后，旧配置能正确加载且功能不受影响
  **Status**: finished

## Stage 1: 配置扩展与 Anki 字段动态获取

**Goal**: 扩展配置模型并打通 Anki 模板与字段元数据获取/保存链路（options → storage → popup），实现动态字段支持基础。
**Success Criteria**:

- options 页可测试 Anki 连接并拉取`Decks`与`Note Types`；选择`Note Type`后显示字段清单并保存到配置
- `utils/storage.js`中`ankiConfig`扩展支持多字段：`defaultModel`、`modelFields`、`promptTemplatesByModel`
- popup 页面能根据配置中的`modelFields`进行动态字段渲染
- 向后兼容：未配置 modelFields 时自动回退到 legacy 模式
  **调整与约束**:
- 解析路径采用 `parseTextWithFallback()` 替换单一提供商调用；当首选提供商失败时按 `fallbackOrder` 依次尝试。
- 集成 Prompt 缺失或异常时，回退到全局 `promptTemplates.custom` 或默认 Prompt，并在 UI 提示原因。
- 可选优化：为解析请求增加超时与取消（AbortController）。
  ```javascript
  // popup: 解析时采用带回退的调用
  import { parseTextWithFallback } from "../utils/ai-service.js";
  const prompt = buildIntegratedPrompt(userInput, modelFields, modelPrompt);
  const aiResult = await parseTextWithFallback(userInput, prompt);
  ```
  **Implementation Details**:
- **配置结构扩展**: 修改`utils/storage.js`的`DEFAULT_CONFIG`
  ```javascript
  ankiConfig: {
    defaultDeck: '',
    defaultModel: '',
    modelFields: [],                    // 新增：当前模板的字段列表
    promptTemplatesByModel: {},         // 新增：按模板存储的prompt配置
    defaultTags: []
  }
  ```
- **Options 页面增强**: 修改`options/options.js`

  ```javascript
  // 新增模板选择监听
  async function handleModelChange(event) {
    const selectedModel = event.target.value;
    if (!selectedModel) return;

    try {
      const fieldResult = await getModelFieldNames(selectedModel);
      if (fieldResult.error) {
        showStatus(`获取模板字段失败: ${fieldResult.error}`, "error");
        return;
      }

      currentModelFields = fieldResult.result;
      renderModelFieldsPreview(currentModelFields);
    } catch (error) {
      showStatus(`获取字段时发生错误: ${error.message}`, "error");
    }
  }

  function renderModelFieldsPreview(fields) {
    const container = document.getElementById("model-fields-preview");
    container.innerHTML = `
      <h4>模板字段 (${fields.length}个):</h4>
      <div class="field-tags">
        ${fields
          .map((field) => `<span class="field-tag">${field}</span>`)
          .join("")}
      </div>
    `;
  }
  ```

- **Popup 动态渲染准备**: 修改`popup/popup.js`
  ```javascript
  async function initializeDynamicFields() {
    const modelFields = config?.ankiConfig?.modelFields;

    if (!modelFields || modelFields.length <= 2) {
      // Legacy模式：使用现有的front/back字段
      renderLegacyFields();
    } else {
      // Dynamic模式：根据modelFields动态生成
      renderDynamicFields(modelFields);
    }
  }

  function renderLegacyFields() {
    const container = document.getElementById("fields-container");
    container.innerHTML = `
      <div class="form-group">
        <label for="front-input">正面:</label>
        <input type="text" id="front-input" />
      </div>
      <div class="form-group">
        <label for="back-input">背面:</label>
        <textarea id="back-input" rows="8"></textarea>
      </div>
    `;
  }

  function renderDynamicFields(fieldNames) {
    const container = document.getElementById("fields-container");
    const fieldsHtml = fieldNames
      .map((fieldName, index) => {
        const inputId = `field-${index}`;
        const inputType =
          fieldName.toLowerCase().includes("example") ||
          fieldName.toLowerCase().includes("meaning")
            ? "textarea"
            : "input";

        if (inputType === "textarea") {
          return `
          <div class="form-group">
            <label for="${inputId}">${fieldName}:</label>
            <textarea id="${inputId}" rows="3" placeholder="AI将自动填充此字段..."></textarea>
          </div>
        `;
        } else {
          return `
          <div class="form-group">
            <label for="${inputId}">${fieldName}:</label>
            <input type="text" id="${inputId}" placeholder="AI将自动填充此字段..." />
          </div>
        `;
        }
      })
      .join("");

    container.innerHTML = fieldsHtml;
  }
  ```
  **Tests**:
- 选择不同`Note Type`后，字段清单正确更新并显示预览
- 保存配置后刷新页面，仍能看到相同的模板与字段配置
- popup 页面在有 modelFields 配置时显示动态字段，无配置时显示 legacy 字段
- 断网或 Anki 未启动时，options 页显示错误信息且不保存无效数据
  **Status**: finished

## Stage 2: Prompt 引擎与一体化解析流程

**Goal**: 实现统一查询+解析的 AI 调用流程，支持动态字段输出，并在 popup 中完成动态字段渲染与写入。
**Success Criteria**:

- 新增`utils/prompt-engine.js`模块，实现字段变量替换和一体化 prompt 生成
- 修改`utils/ai-service.js`，支持动态字段 JSON 输出格式（替代固定的 front/back 格式）
- popup 页面完成动态字段的 AI 结果填充和 Anki 写入功能
- 完善错误处理：JSON 解析失败时自动重试，字段验证不通过时给出明确提示
  **调整与约束**:
- 采用 `promptTemplatesByModel: { [modelName: string]: string }` 存储按模板的 Prompt；保留全局 `promptTemplates.custom` 作为兜底。
- 在 `migrateConfig()` 中将版本提升到 `2.1` 并初始化缺失的 `promptTemplatesByModel` 字段。
- 新增接口：`loadPromptForModel(modelName)` 与 `savePromptForModel(modelName, prompt)`，随 `#default-model` 变化加载/保存。
- 模板校验：`validatePromptTemplate(template)` 若未包含 `{{INPUT_TEXT}}` 给出警告并允许继续（自动追加原文到末尾）。
  ```javascript
  // storage / prompt-engine 接口示意
  export function loadPromptForModel(modelName, config) {
    return (
      config?.ankiConfig?.promptTemplatesByModel?.[modelName] ||
      config?.promptTemplates?.custom ||
      ""
    );
  }
  export function savePromptForModel(modelName, prompt, config) {
    config.ankiConfig.promptTemplatesByModel =
      config.ankiConfig.promptTemplatesByModel || {};
    config.ankiConfig.promptTemplatesByModel[modelName] = prompt;
    return config;
  }
  export function validatePromptTemplate(tpl) {
    return tpl && tpl.includes("{{INPUT_TEXT}}");
  }
  ```
  **Implementation Details**:
- **新增 Prompt 引擎**: 创建`utils/prompt-engine.js`

  ```javascript
  // 核心功能：统一查询+解析的prompt模板
  export function buildIntegratedPrompt(userInput, fieldNames, customTemplate) {
    const defaultTemplate = customTemplate || getDefaultIntegratedTemplate();

    // 生成动态字段schema
    const fieldSchema = generateFieldSchema(fieldNames);

    // 替换模板变量
    let prompt = defaultTemplate
      .replace("{{INPUT_TEXT}}", userInput)
      .replace("{{FIELD_SCHEMA}}", fieldSchema)
      .replace(
        "{{AVAILABLE_FIELDS}}",
        fieldNames.map((f) => `"${f}"`).join(", ")
      );

    // 添加JSON格式强制约束
    prompt += `\n\nCRITICAL要求:\n- 输出有效JSON格式\n- 只能使用字段: ${fieldNames.join(
      ", "
    )}\n- 可部分输出，但字段名必须准确`;

    return prompt;
  }

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

  function generateFieldSchema(fieldNames) {
    const schema = {};
    fieldNames.forEach((field) => {
      // 根据字段名提供智能提示
      if (
        field.toLowerCase().includes("word") ||
        field.toLowerCase().includes("front")
      ) {
        schema[field] = "单词本身";
      } else if (
        field.toLowerCase().includes("reading") ||
        field.toLowerCase().includes("pronunciation")
      ) {
        schema[field] = "读音/音标";
      } else if (
        field.toLowerCase().includes("meaning") ||
        field.toLowerCase().includes("definition")
      ) {
        schema[field] = "释义和解释";
      } else if (field.toLowerCase().includes("example")) {
        schema[field] = "使用例句";
      } else {
        schema[field] = `${field}相关内容`;
      }
    });
    return JSON.stringify(schema, null, 2);
  }

  // 字段验证函数
  export function validateAIOutput(aiOutput, expectedFields) {
    try {
      const parsed =
        typeof aiOutput === "string" ? JSON.parse(aiOutput) : aiOutput;
      const outputFields = Object.keys(parsed);

      // 检查是否有无效字段
      const invalidFields = outputFields.filter(
        (field) => !expectedFields.includes(field)
      );

      return {
        isValid: invalidFields.length === 0,
        parsedData: parsed,
        invalidFields,
        validFields: outputFields.filter((field) =>
          expectedFields.includes(field)
        ),
        hasContent: outputFields.some(
          (field) => parsed[field] && parsed[field].trim()
        ),
      };
    } catch (error) {
      return {
        isValid: false,
        error: `JSON解析失败: ${error.message}`,
        parsedData: null,
      };
    }
  }
  ```

- **AI 服务适配**: 修改`utils/ai-service.js`

  ```javascript
  // 新增动态字段解析函数
  export async function parseTextWithDynamicFields(
    inputText,
    fieldNames,
    customTemplate
  ) {
    try {
      const { provider, apiKey, modelName } = await getCurrentModel();

      // 使用prompt-engine构建一体化prompt
      const integratedPrompt = buildIntegratedPrompt(
        inputText,
        fieldNames,
        customTemplate
      );

      console.log(`使用 ${provider} (${modelName}) 进行一体化解析`);

      const responseText = await callProviderAPI(
        provider,
        apiKey,
        modelName,
        integratedPrompt,
        {
          temperature: 0.3,
          maxTokens: 2000,
        }
      );

      // 验证AI输出
      const validation = validateAIOutput(responseText, fieldNames);

      if (!validation.isValid) {
        // 自动重试一次
        console.warn("首次解析结果验证失败，开始重试...", validation);
        const retryResponse = await callProviderAPI(
          provider,
          apiKey,
          modelName,
          integratedPrompt,
          {
            temperature: 0.1, // 降低temperature提高一致性
            maxTokens: 2000,
          }
        );

        const retryValidation = validateAIOutput(retryResponse, fieldNames);
        if (!retryValidation.isValid) {
          throw new Error(
            retryValidation.error ||
              `输出包含无效字段: ${retryValidation.invalidFields?.join(", ")}`
          );
        }

        validation = retryValidation;
      }

      if (!validation.hasContent) {
        throw new Error("AI输出的所有字段都为空，请检查输入内容或重试");
      }

      await updateProviderHealth(provider, "healthy");
      return validation.parsedData;
    } catch (error) {
      console.error("动态字段解析失败:", error);
      const config = await loadConfig();
      await updateProviderHealth(
        config.aiConfig.provider,
        "error",
        error.message
      );
      throw new Error(`AI解析失败: ${error.message}`);
    }
  }

  // 保持向后兼容的legacy解析函数
  export async function parseText(inputText, promptTemplate) {
    // 检测是否为legacy调用（通过参数类型判断）
    if (typeof promptTemplate === "string") {
      // Legacy模式：使用现有的解析逻辑
      return parseTextLegacy(inputText, promptTemplate);
    } else {
      // 新模式：动态字段解析
      const { fieldNames, customTemplate } = promptTemplate;
      return parseTextWithDynamicFields(inputText, fieldNames, customTemplate);
    }
  }
  ```

- **Popup 解析流程重构**: 修改`popup/popup.js`

  ```javascript
  async function handleParse() {
    const textInput = document.getElementById("text-input").value;
    if (!textInput.trim()) {
      updateStatus("请输入要解析的文本", "error");
      return;
    }

    setUiLoading(true, "正在进行AI解析...");

    try {
      const modelFields = config?.ankiConfig?.modelFields;
      let result;

      if (!modelFields || modelFields.length <= 2) {
        // Legacy模式
        const customPrompt = config?.promptTemplates?.custom;
        result = await parseText(textInput, customPrompt);
        fillLegacyFields(result);
      } else {
        // Dynamic模式
        const customTemplate =
          config?.promptTemplates?.templatesByModel?.[
            config.ankiConfig.defaultModel
          ];
        result = await parseTextWithDynamicFields(
          textInput,
          modelFields,
          customTemplate
        );
        fillDynamicFields(result, modelFields);
      }

      document.getElementById("write-btn").disabled = false;
      updateStatus("解析完成", "success");
    } catch (error) {
      console.error("解析出错:", error);
      updateStatus(`解析失败: ${error.message}`, "error");
    } finally {
      setUiLoading(false);
    }
  }

  function fillDynamicFields(aiResult, fieldNames) {
    fieldNames.forEach((fieldName, index) => {
      const inputId = `field-${index}`;
      const element = document.getElementById(inputId);
      if (element) {
        element.value = aiResult[fieldName] || "";
        // 添加填充状态指示
        element.classList.toggle("filled", !!aiResult[fieldName]);
      }
    });

    // 显示填充状态统计
    const filledCount = Object.keys(aiResult).length;
    updateStatus(
      `已填充 ${filledCount}/${fieldNames.length} 个字段`,
      "success"
    );
  }

  function fillLegacyFields(result) {
    document.getElementById("front-input").value = result.front || "";
    document.getElementById("back-input").value = result.back || "";
  }
  ```

- **动态写入逻辑**: 重构`handleWriteToAnki()`
  ```javascript
  async function handleWriteToAnki() {
    setUiLoading(true, "正在写入 Anki...");
    document.getElementById("write-btn").disabled = true;

    try {
      const modelFields = config?.ankiConfig?.modelFields;
      let fields = {};

      if (!modelFields || modelFields.length <= 2) {
        // Legacy模式
        const front = document.getElementById("front-input")?.value;
        const back = document.getElementById("back-input")?.value;

        if (!front || !back) {
          throw new Error("请填写正反面内容");
        }

        const fieldNames = config?.ankiConfig?.modelFields || ["Front", "Back"];
        fields[fieldNames[0]] = wrapContentWithStyle(front);
        fields[fieldNames[1]] = wrapContentWithStyle(back);
      } else {
        // Dynamic模式：收集所有字段值
        modelFields.forEach((fieldName, index) => {
          const element = document.getElementById(`field-${index}`);
          if (element && element.value.trim()) {
            fields[fieldName] = wrapContentWithStyle(element.value);
          }
        });

        // 验证至少有一个字段有内容
        if (Object.keys(fields).length === 0) {
          throw new Error("至少需要填写一个字段内容");
        }
      }

      // 执行写入
      const noteData = {
        deckName: config?.ankiConfig?.defaultDeck || "Default",
        modelName: config?.ankiConfig?.defaultModel || "Basic",
        fields: fields,
        tags: config?.ankiConfig?.defaultTags || [],
      };

      const result = await addNote(noteData);
      if (result.error) {
        throw new Error(result.error);
      }

      updateStatus(`写入成功 (ID: ${result.result})`, "success");
    } catch (error) {
      console.error("写入Anki出错:", error);
      updateStatus(`写入失败: ${error.message}`, "error");
    } finally {
      setUiLoading(false);
      document.getElementById("write-btn").disabled = false;
    }
  }
  ```

**Tests**:

- Legacy 模式（≤2 字段）：功能与现有版本完全一致
- Dynamic 模式（>2 字段）：AI 能正确输出多字段 JSON，popup 能正确填充和写入
- 错误处理：JSON 格式错误时自动重试，字段验证失败时显示具体错误信息
- 边界情况：空输入、全空字段、部分字段填充等情况都有适当处理
  **Status**: finished

## Stage 3: Options 页面 Prompt 配置界面

**Goal**: 在 options 页面提供可视化的 Prompt 配置界面，支持按模板定制 Prompt 和字段变量插入。
**Success Criteria**:

- options 页面新增"Prompt 配置"区域，支持按 Anki 模板选择和编辑专用 Prompt
- 提供字段标签点击插入功能，用户可方便地在 Prompt 中引用字段变量
- 实现 Prompt 模板的保存、加载和预览功能
- 向后兼容：未配置专用 Prompt 时使用默认模板
  **调整与约束**:
- 导出配置需“脱敏 API Key”，不导出明文；导入后保持 Key 为空，需用户重新填写。
  ```javascript
  // 建议的导出逻辑（脱敏 API Key）
  function exportConfiguration() {
    const exportData = JSON.parse(JSON.stringify(currentConfig));
    if (exportData?.aiConfig?.models) {
      Object.keys(exportData.aiConfig.models).forEach((p) => {
        if (exportData.aiConfig.models[p]) {
          exportData.aiConfig.models[p].apiKey = ""; // 或使用 '********' 占位
        }
      });
    }
    exportData.exportDate = new Date().toISOString();
    exportData.version = exportData.version || "2.1";
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anki-word-assistant-config-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  ```
  **Implementation Details**:
- **Options HTML 扩展**: 在`options/options.html`中添加 Prompt 配置区域

  ```html
  <!-- 在Anki配置区域后添加 -->
  <div class="form-group">
    <h3>Prompt配置</h3>
    <div class="prompt-config-section">
      <!-- 模板选择器已在Stage 1中实现，这里复用 -->

      <!-- 字段标签区域 -->
      <div
        id="prompt-field-tags"
        class="field-tags-container"
        style="display: none;"
      >
        <h4>可用字段（点击插入）:</h4>
        <div id="field-tags-list" class="field-tags">
          <!-- 动态生成字段标签 -->
        </div>
      </div>

      <!-- Prompt编辑器 -->
      <div class="form-group">
        <label for="custom-prompt-textarea">自定义Prompt模板:</label>
        <textarea
          id="custom-prompt-textarea"
          rows="12"
          placeholder="请选择Anki模板后编辑对应的Prompt模板..."
          class="w-full p-2 border rounded"
        >
        </textarea>
        <div class="text-sm text-gray-600 mt-1">
          提示：使用{{INPUT_TEXT}}表示用户输入，{{FIELD_SCHEMA}}表示字段结构
        </div>
      </div>

      <!-- 预览区域 -->
      <div class="form-group">
        <h4>预览效果:</h4>
        <pre
          id="prompt-preview-content"
          class="bg-gray-50 p-3 rounded text-sm max-h-40 overflow-y-auto"
        >
          选择模板并编辑Prompt后，这里会显示预览效果
        </pre>
      </div>
    </div>
  </div>
  ```

- **Options JS 增强**: 扩展`options/options.js`

  ```javascript
  // 在现有handleModelChange基础上添加Prompt配置功能
  async function handleModelChange(event) {
    const selectedModel = event.target.value;
    if (!selectedModel) {
      hidePromptConfig();
      return;
    }

    try {
      // 获取字段（已在Stage 1实现）
      const fieldResult = await getModelFieldNames(selectedModel);
      if (fieldResult.error) {
        showStatus(`获取模板字段失败: ${fieldResult.error}`, 'error');
        return;
      }

      currentModelFields = fieldResult.result;
      renderModelFieldsPreview(currentModelFields);  // Stage 1功能

      // 新增：显示Prompt配置区域
      showPromptConfig(selectedModel, currentModelFields);

    } catch (error) {
      showStatus(`获取字段时发生错误: ${error.message}`, 'error');
    }
  }

  function showPromptConfig(modelName, fields) {
    const promptSection = document.getElementById('prompt-field-tags');
    const fieldTagsList = document.getElementById('field-tags-list');
    const promptTextarea = document.getElementById('custom-prompt-textarea');

    // 显示字段标签
    promptSection.style.display = 'block';
    fieldTagsList.innerHTML = fields.map(field =>
      `<button type="button" class="field-tag-btn" data-field="${field}">${field}</button>`
    ).join('');

    // 绑定字段标签点击事件
    fieldTagsList.querySelectorAll('.field-tag-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        insertFieldPlaceholder(e.target.dataset.field);
      });
    });

    // 加载该模板的existing prompt
    loadPromptForModel(modelName);

    // 启用预览更新
    promptTextarea.addEventListener('input', updatePromptPreview);
    updatePromptPreview();
  }

  function hidePromptConfig() {
    document.getElementById('prompt-field-tags').style.display = 'none';
    document.getElementById('custom-prompt-textarea').value = '';
    document.getElementById('prompt-preview-content').textContent = '选择模板并编辑Prompt后，这里会显示预览效果';
  }

  function insertFieldPlaceholder(fieldName) {
    const textarea = document.getElementById('custom-prompt-textarea');
    const cursorPos = textarea.selectionStart;
    const textBefore = textarea.value.substring(0, cursorPos);
    const textAfter = textarea.value.substring(textarea.selectionEnd);

    const placeholder = `{{${fieldName}}}`;
    textarea.value = textBefore + placeholder + textAfter;

    // 设置光标位置
    textarea.selectionStart = textarea.selectionEnd = cursorPos + placeholder.length;
    textarea.focus();

    updatePromptPreview();
  }

  function loadPromptForModel(modelName) {
    const config = currentConfig || {};
    const savedPrompt = config?.promptTemplates?.templatesByModel?.[modelName];

    const textarea = document.getElementById('custom-prompt-textarea');
    if (savedPrompt) {
      textarea.value = savedPrompt;
    } else {
      // 使用默认模板
      textarea.value = getDefaultPromptTemplate();
    }

    updatePromptPreview();
  }

  function getDefaultPromptTemplate() {
    return `# Role: 专业单词查询助手
  ```

请完成以下任务：

1. 查询单词/短语: "{{INPUT_TEXT}}"
2. 生成详细解析信息
3. 按以下 JSON 格式输出：
   {{FIELD_SCHEMA}}

要求：

- 输出纯 JSON 格式，不包含任何解释文字
- 根据单词/短语的特点，填充相应字段
- 如果某个字段不适用，可以不输出该字段`;
  }

  function updatePromptPreview() {
  const promptTemplate = document.getElementById('custom-prompt-textarea').value;
  const previewContent = document.getElementById('prompt-preview-content');

  if (!promptTemplate.trim() || !currentModelFields.length) {
  previewContent.textContent = '选择模板并编辑 Prompt 后，这里会显示预览效果';
  return;
  }

  // 模拟预览效果
  let preview = promptTemplate
  .replace(/\{\{INPUT_TEXT\}\}/g, '"示例单词"')
  .replace(/\{\{FIELD_SCHEMA\}\}/g, generatePreviewSchema(currentModelFields));

  previewContent.textContent = preview;
  }

  function generatePreviewSchema(fields) {
  const schema = {};
  fields.forEach(field => {
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

  // 修改现有的 handleSave 函数，保存 Prompt 配置
  async function handleSave() {
  // ...existing save logic...

  // 新增：保存 Prompt 模板
  const selectedModel = document.getElementById('default-model').value;
  const promptTemplate = document.getElementById('custom-prompt-textarea').value;

  if (selectedModel && promptTemplate.trim()) {
  if (!config.promptTemplates) {
  config.promptTemplates = {};
  }
  if (!config.promptTemplates.templatesByModel) {
  config.promptTemplates.templatesByModel = {};
  }

      config.promptTemplates.templatesByModel[selectedModel] = promptTemplate;

  }

  // ...rest of save logic...
  }

  ```

  ```

**Tests**:

- 选择不同 Anki 模板时，字段标签正确更新
- 点击字段标签能正确插入变量占位符到光标位置
- Prompt 预览能正确显示替换后的效果
- 保存后刷新页面，能正确恢复对应模板的 Prompt 配置
  **Status**: finished

## Stage 4: 配置管理与用户体验优化

**Goal**: 提供配置导入导出功能，优化用户体验，完善错误处理。
**Success Criteria**:

- options 页面新增配置导入导出功能
- 简化字段类型自动识别（基于字段名简单判断）
- 完善错误提示和 loading 状态
- 提供配置重置功能
  **Implementation Details**:
- **配置管理功能**: 在`options/options.js`中添加

  ```javascript
  // 配置导出
  function exportConfiguration() {
    const exportData = {
      ...currentConfig,
      exportDate: new Date().toISOString(),
      version: currentConfig.version || "2.1",
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `anki-word-assistant-config-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // 配置导入
  async function importConfiguration(file) {
    try {
      const text = await file.text();
      const importedConfig = JSON.parse(text);

      // 简单验证
      if (!importedConfig.version || !importedConfig.aiConfig) {
        throw new Error("配置文件格式不正确");
      }

      // 合并配置（保留当前的API密钥，避免明文导入）
      const mergedConfig = {
        ...importedConfig,
        aiConfig: {
          ...importedConfig.aiConfig,
          models: {
            ...importedConfig.aiConfig.models,
          },
        },
      };

      // 清空API Key（为安全考虑）
      Object.keys(mergedConfig.aiConfig.models).forEach((provider) => {
        if (mergedConfig.aiConfig.models[provider]) {
          mergedConfig.aiConfig.models[provider].apiKey = "";
        }
      });

      await saveConfig(mergedConfig);
      showStatus("配置导入成功，请重新配置API密钥", "success");

      // 重新加载页面配置
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      showStatus(`配置导入失败: ${error.message}`, "error");
    }
  }

  // 重置配置
  async function resetConfiguration() {
    if (!confirm("确定要重置所有配置吗？此操作不可撤销。")) {
      return;
    }

    try {
      const defaultConfig = getDefaultConfig();
      await saveConfig(defaultConfig);
      showStatus("配置已重置为默认值", "success");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      showStatus(`重置配置失败: ${error.message}`, "error");
    }
  }
  ```

- **Options HTML 添加配置管理 UI**:

  ```html
  <!-- 在页面底部添加配置管理区域 -->
  <div class="config-management-section">
    <h3>配置管理</h3>
    <div class="flex gap-2">
      <button type="button" id="export-config-btn" class="btn-secondary">
        导出配置
      </button>
      <div class="file-input-wrapper">
        <input
          type="file"
          id="import-config-input"
          accept=".json"
          style="display: none;"
        />
        <button type="button" id="import-config-btn" class="btn-secondary">
          导入配置
        </button>
      </div>
      <button type="button" id="reset-config-btn" class="btn-danger">
        重置配置
      </button>
    </div>
  </div>
  ```

- **简化字段类型识别**: 直接在 Stage 1 的`renderDynamicFields`中实现
  ```javascript
  // 在popup/popup.js中的renderDynamicFields函数中
  function getInputTypeForField(fieldName) {
    const name = fieldName.toLowerCase();

    // 简单的启发式规则
    if (
      name.includes("example") ||
      name.includes("sentence") ||
      name.includes("meaning") ||
      name.includes("definition") ||
      name.includes("explanation") ||
      name.includes("note")
    ) {
      return { type: "textarea", rows: 3 };
    } else {
      return { type: "input" };
    }
  }
  ```

**Tests**:

- 配置导出生成有效 JSON 文件
- 配置导入能正确验证格式并应用配置
- 重置功能能恢复到默认状态
- 字段类型识别符合常见使用场景
  **Status**: finished

## 错误处理与重试机制规格

### 全局错误处理原则

1. **用户友好**: 所有错误信息都要转换为用户可理解的中文提示
2. **自动恢复**: 对于临时性错误（网络、AI 服务），优先使用自动重试
3. **降级处理**: 当新功能出现问题时，自动回退到旧版本逻辑
4. **状态保持**: 错误发生时保持用户已输入的数据不丢失

### 具体错误处理策略

#### 1. AI 解析错误处理

```javascript
// 在utils/ai-service.js中实现
export async function parseTextWithRetry(
  inputText,
  fieldNames,
  customTemplate,
  maxRetries = 2
) {
  let lastError = null;
  let retryCount = 0;

  while (retryCount < maxRetries) {
    try {
      const result = await parseTextWithDynamicFields(
        inputText,
        fieldNames,
        customTemplate
      );

      // 成功解析，重置错误状态
      await updateProviderHealth(getCurrentProvider(), "healthy");
      return result;
    } catch (error) {
      lastError = error;
      retryCount++;

      console.warn(`解析尝试 ${retryCount}/${maxRetries} 失败:`, error.message);

      if (retryCount < maxRetries) {
        // 等待递增延迟后重试
        await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));

        // 如果是JSON解析错误，降低temperature重试
        if (error.message.includes("JSON解析失败")) {
          console.log("检测到JSON解析错误，降低temperature重试");
          // 在parseTextWithDynamicFields内部已经实现了temperature降低的重试逻辑
        }
      }
    }
  }

  // 所有重试都失败，尝试降级到legacy模式
  console.warn("动态字段解析完全失败，尝试降级到legacy模式");
  try {
    const legacyResult = await parseTextLegacy(inputText, customTemplate || "");

    // 返回降级结果，但要适配到动态字段格式
    const adaptedResult = {};
    if (fieldNames.length >= 1)
      adaptedResult[fieldNames[0]] = legacyResult.front || "";
    if (fieldNames.length >= 2)
      adaptedResult[fieldNames[1]] = legacyResult.back || "";

    return adaptedResult;
  } catch (legacyError) {
    throw new Error(
      `解析失败: ${lastError.message}。降级解析也失败: ${legacyError.message}`
    );
  }
}
```

#### 2. AnkiConnect 连接错误处理

```javascript
// 在utils/ankiconnect.js中增强错误处理
export async function addNoteWithRetry(noteData, maxRetries = 3) {
  let retryCount = 0;
  let lastError = null;

  while (retryCount < maxRetries) {
    try {
      const result = await addNote(noteData);
      if (result.error) {
        throw new Error(result.error);
      }
      return result;
    } catch (error) {
      lastError = error;
      retryCount++;

      // 特定错误的处理策略
      if (error.message.includes("duplicate")) {
        throw new Error("卡片内容重复，请修改后重试");
      } else if (
        error.message.includes("network") ||
        error.message.includes("fetch")
      ) {
        if (retryCount < maxRetries) {
          console.warn(
            `AnkiConnect连接失败，正在重试 (${retryCount}/${maxRetries})`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, 2000 * retryCount)
          );
          continue;
        }
      }

      if (retryCount >= maxRetries) {
        throw new Error(getAnkiErrorMessage(error.message));
      }
    }
  }
}

function getAnkiErrorMessage(errorMsg) {
  const errorMappings = {
    "Failed to fetch": "Anki未启动或AnkiConnect插件未安装",
    "deck was not found": "指定的牌组不存在，请检查配置",
    "model was not found": "指定的模板不存在，请检查配置",
    duplicate: "卡片内容重复",
    permission: "AnkiConnect权限不足，请检查插件配置",
  };

  for (const [key, value] of Object.entries(errorMappings)) {
    if (errorMsg.toLowerCase().includes(key.toLowerCase())) {
      return value;
    }
  }

  return `Anki操作失败: ${errorMsg}`;
}
```

#### 3. 配置加载错误处理

```javascript
// 在utils/storage.js中增强错误恢复
export async function loadConfigWithFallback() {
  try {
    const config = await loadConfig();

    // 验证关键配置项
    if (!config || typeof config !== "object") {
      throw new Error("配置格式错误");
    }

    // 检查是否缺少关键字段，自动修复
    const fixedConfig = await repairConfigIfNeeded(config);

    if (fixedConfig !== config) {
      console.warn("检测到配置异常，已自动修复");
      await saveConfig(fixedConfig);
    }

    return fixedConfig;
  } catch (error) {
    console.error("配置加载失败:", error);

    // 尝试加载备份配置
    try {
      const backupConfig = await loadBackupConfig();
      if (backupConfig) {
        console.log("使用备份配置恢复");
        await saveConfig(backupConfig);
        return backupConfig;
      }
    } catch (backupError) {
      console.error("备份配置加载也失败:", backupError);
    }

    // 最后降级到默认配置
    console.warn("使用默认配置");
    const defaultConfig = getDefaultConfig();
    await saveConfig(defaultConfig);
    return defaultConfig;
  }
}

async function repairConfigIfNeeded(config) {
  const fixed = { ...config };
  let needsRepair = false;

  // 修复缺失的ankiConfig
  if (!fixed.ankiConfig) {
    fixed.ankiConfig = getDefaultConfig().ankiConfig;
    needsRepair = true;
  }

  // 修复缺失的modelFields数组
  if (!Array.isArray(fixed.ankiConfig.modelFields)) {
    fixed.ankiConfig.modelFields = [];
    needsRepair = true;
  }

  // 修复缺失的promptTemplates
  if (!fixed.promptTemplates) {
    fixed.promptTemplates = { custom: "", templatesByModel: {} };
    needsRepair = true;
  }

  if (!fixed.promptTemplates.templatesByModel) {
    fixed.promptTemplates.templatesByModel = {};
    needsRepair = true;
  }

  return needsRepair ? fixed : config;
}
```

#### 4. UI 状态错误处理

```javascript
// 在popup/popup.js中实现完善的状态管理
class ErrorBoundary {
  constructor() {
    this.errorCount = 0;
    this.lastErrorTime = 0;
  }

  async handleError(error, context = "unknown") {
    this.errorCount++;
    this.lastErrorTime = Date.now();

    console.error(`[${context}] 错误:`, error);

    // 频繁错误检测
    if (this.errorCount > 5 && Date.now() - this.lastErrorTime < 30000) {
      this.showCriticalError("检测到频繁错误，建议刷新页面或检查网络连接");
      return;
    }

    // 根据错误类型显示不同的处理建议
    const errorMsg = this.getErrorMessage(error, context);
    updateStatus(errorMsg, "error");

    // 自动恢复UI状态
    setUiLoading(false);
    this.resetUIState();
  }

  getErrorMessage(error, context) {
    const message = error.message || error.toString();

    switch (context) {
      case "parse":
        if (message.includes("网络")) {
          return "网络连接失败，请检查网络后重试";
        } else if (message.includes("API Key")) {
          return "AI服务配置错误，请检查设置页面";
        } else if (message.includes("JSON")) {
          return "AI解析格式错误，已自动重试";
        }
        return `解析失败: ${message}`;

      case "anki":
        if (message.includes("未启动")) {
          return "请启动Anki并确保AnkiConnect插件已安装";
        } else if (message.includes("重复")) {
          return "卡片内容重复，请修改后重试";
        }
        return `写入失败: ${message}`;

      case "config":
        return "配置加载异常，已使用默认配置";

      default:
        return `操作失败: ${message}`;
    }
  }

  resetUIState() {
    // 确保按钮状态正确
    document.getElementById("parse-btn").disabled = false;
    document.getElementById("write-btn").disabled = false;
  }

  showCriticalError(message) {
    updateStatus(message, "error");

    // 显示重启建议
    setTimeout(() => {
      if (confirm(`${message}\n\n点击确定刷新页面，取消继续使用`)) {
        window.location.reload();
      }
    }, 1000);
  }
}

// 全局错误边界实例
const errorBoundary = new ErrorBoundary();

// 修改现有错误处理，使用错误边界
async function handleParse() {
  try {
    // ...existing parse logic...
  } catch (error) {
    await errorBoundary.handleError(error, "parse");
  }
}

async function handleWriteToAnki() {
  try {
    // ...existing write logic...
  } catch (error) {
    await errorBoundary.handleError(error, "anki");
  }
}
```

### 重试机制配置

```javascript
// 在各模块中使用的重试配置常量
export const RETRY_CONFIG = {
  AI_PARSE: { maxRetries: 2, baseDelay: 1000 },
  ANKI_CONNECT: { maxRetries: 3, baseDelay: 2000 },
  CONFIG_LOAD: { maxRetries: 1, baseDelay: 500 },
  NETWORK: { maxRetries: 3, baseDelay: 1500 },
};

// 通用重试函数
export async function withRetry(operation, config = RETRY_CONFIG.NETWORK) {
  let attempt = 0;
  let lastError;

  while (attempt < config.maxRetries) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      attempt++;

      if (attempt < config.maxRetries) {
        const delay = config.baseDelay * Math.pow(2, attempt - 1); // 指数退避
        console.warn(
          `操作失败，${delay}ms后重试 (${attempt}/${config.maxRetries}):`,
          error.message
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
```

### 测试用例

- **网络断开时**: AI 解析应该显示网络错误，并提供重试选项
- **Anki 未启动**: 写入操作应该显示明确的 Anki 状态提示
- **JSON 格式错误**: 应该自动重试，重试失败后回退到 legacy 模式
- **配置损坏**: 应该自动恢复到默认配置，不影响基本功能
- **频繁错误**: 应该检测并建议用户刷新页面

这些错误处理机制确保了系统的健壮性，用户在遇到问题时能获得清晰的指引和自动恢复能力。

## 开发优先级与执行路径

### 推荐开发顺序

1. **Stage 0** (基础重构准备) - 1-2 天

   - 建立向后兼容基础，确保现有功能不受影响
   - 为动态功能做好架构准备

2. **Stage 1** (配置扩展与字段获取) - 2-3 天

   - 实现核心的动态字段配置和渲染能力
   - 完成 options→storage→popup 的数据流打通

3. **Stage 2** (一体化解析流程) - 3-4 天

   - 实现统一查询+解析的 AI 调用
   - 完成动态字段填充和写入功能
   - 这是整合查词解析功能的核心实现

4. **Stage 3** (Prompt 配置界面) - 2-3 天

   - 提供可视化的 Prompt 编辑体验
   - 完善用户配置流程

5. **Stage 4** (配置管理优化) - 1-2 天
   - 添加配置导入导出等辅助功能

### 核心目标对照检查

基于"整合查词解析功能实现方案.md"的需求，本实现计划覆盖了：

✅ **整合查询和解析流程**：Stage 2 实现了统一的 AI 调用，替代了原有的两步流程  
✅ **动态字段映射**：Stage 1-2 完整实现了 popup 动态字段渲染和 AI 结果映射  
✅ **增强的 Prompt 配置体验**：Stage 3 提供了可视化字段变量插入和预览功能  
✅ **向后兼容性**：Stage 0 确保了现有 front/back 双字段模式的完全兼容  
✅ **错误处理和重试**：通过专门的错误处理规格确保了系统健壮性

### 期望收益验证

**用户操作流程对比**：

```
原流程：
1. 外部软件查询单词 → 2. 复制结果到扩展 → 3. AI解析 → 4. 写入Anki (4步)

新流程：
1. 输入单词到扩展 → 2. 一键解析写入 (2步)
```

**技术债务解决**：

- ❌ 固定两字段限制 → ✅ 支持任意数量字段
- ❌ 硬编码数据处理 → ✅ 动态字段映射
- ❌ 固定 AI 输出格式 → ✅ 基于模板的动态 JSON 输出

### 风险缓解措施

1. **向后兼容风险** → Stage 0 专门处理，确保 legacy 模式 100%可用
2. **AI 输出可靠性** → 简单重试机制 + 降级到 legacy 模式
3. **用户学习成本** → 渐进式功能引导，默认使用简单模式
4. **开发复杂度** → 分阶段实施，每阶段都有独立的测试验证

### 成功标准

完成所有阶段后，系统应达到：

- 用户可以通过 options 页面配置任意 Anki 模板和对应的 Prompt
- popup 页面能根据配置动态显示字段并完成一体化解析
- 保持现有用户的使用习惯不变（legacy 模式）
- 支持配置管理和错误恢复，确保系统稳定性

这个实现计划完全符合原需求文档的技术实现方案，提供了清晰的开发路径和具体的代码实现指导。
