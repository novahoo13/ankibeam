import { test } from "node:test";
import assert from "node:assert/strict";

import "./helpers/test-env.js";
import { CONFIG_VERSION } from "../utils/storage.js";
import { getAllProviders } from "../utils/providers.config.js";

const optionsModuleUrl = new URL("../options/options.js", import.meta.url);

function buildSampleConfig() {
  const providers = getAllProviders();
  const models = {};

  providers.forEach((provider) => {
    models[provider.id] = {
      apiKey: `${provider.id}-key`,
      modelName: provider.defaultModel || `${provider.id}-model`,
      apiUrl: provider.api?.baseUrl || `https://api.${provider.id}.example/v1`,
      healthStatus: "healthy",
      lastHealthCheck: "2025-01-01T08:00:00.000Z",
      lastErrorMessage: "",
    };
  });

  return {
    version: CONFIG_VERSION,
    aiConfig: {
      provider: providers[0]?.id ?? "google",
      models,
      fallbackOrder: providers.map((provider) => provider.id),
    },
    promptTemplates: {
      promptTemplatesByModel: {},
    },
    ankiConfig: {
      defaultDeck: "",
      defaultModel: "",
      modelFields: [],
      defaultTags: [],
    },
    styleConfig: {
      fontSize: "14px",
      textAlign: "left",
      lineHeight: "1.4",
    },
    language: "zh-CN",
  };
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

async function flushAsync() {
  await new Promise((resolve) => setImmediate(resolve));
}

async function waitForCondition(check, timeoutMs = 500, stepMs = 10) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }
  throw new Error("condition not met within timeout");
}

test("options 页面基于配置动态渲染并支持保存与测试", async () => {
  const sampleConfig = buildSampleConfig();
  let savedConfig = null;
  let saveCallCount = 0;
  let lastTestRequest = null;

  const promptStore = new Map();

  globalThis.__ankiWordOptionsDeps = {
    storage: {
      loadConfig: async () => structuredCloneSafe(sampleConfig),
      saveConfig: async (config) => {
        saveCallCount += 1;
        savedConfig = structuredCloneSafe(config);
      },
      getDefaultConfig: () => structuredCloneSafe(sampleConfig),
    },
    aiService: {
      testConnection: async (providerId, apiKey, modelName) => {
        lastTestRequest = { providerId, apiKey, modelName };
        return { success: true, message: `${providerId} 连接测试成功` };
      },
    },
    anki: {
      testConnection: async () => ({ result: "2.1", error: null }),
      getDeckNames: async () => ({ result: ["Default"], error: null }),
      getModelNames: async () => ({ result: ["Basic"], error: null }),
      getModelFieldNames: async () => ({
        result: ["Front", "Back"],
        error: null,
      }),
    },
    prompt: {
      loadPromptForModel: (modelName) => promptStore.get(modelName) ?? "",
      savePromptForModel: (modelName, customPrompt, config) => {
        if (!config.promptTemplates) {
          config.promptTemplates = { promptTemplatesByModel: {} };
        }
        if (!config.promptTemplates.promptTemplatesByModel) {
          config.promptTemplates.promptTemplatesByModel = {};
        }
        const existing =
          config.promptTemplates.promptTemplatesByModel[modelName] ?? {};
        config.promptTemplates.promptTemplatesByModel[modelName] = {
          ...existing,
          customPrompt,
        };
        promptStore.set(modelName, customPrompt);
      },
      getPromptConfigForModel: (modelName, config) =>
        config?.promptTemplates?.promptTemplatesByModel?.[modelName] ?? {
          selectedFields: [],
          fieldConfigs: {},
          customPrompt: "",
        },
      updatePromptConfigForModel: (modelName, patch, config) => {
        if (!config.promptTemplates) {
          config.promptTemplates = { promptTemplatesByModel: {} };
        }
        const existing =
          config.promptTemplates.promptTemplatesByModel?.[modelName] ?? {
            selectedFields: [],
            fieldConfigs: {},
            customPrompt: "",
          };
        config.promptTemplates.promptTemplatesByModel = {
          ...(config.promptTemplates.promptTemplatesByModel ?? {}),
          [modelName]: {
            ...existing,
            ...patch,
          },
        };
      },
    },
  };

  document.body.innerHTML = `
    <nav>
      <button class="settings-tab-btn active" data-tab="ai-config" aria-selected="true"></button>
    </nav>
    <div id="ai-config" class="tab-content active">
      <select id="ai-provider"></select>
      <div id="provider-config-container"></div>
    </div>
    <div id="prompt-config" class="tab-content"></div>
    <button id="save-btn"></button>
    <button id="test-anki-btn"></button>
    <select id="default-model"></select>
    <select id="default-deck"></select>
    <textarea id="custom-prompt-textarea"></textarea>
    <div id="field-selection-list"></div>
    <div id="field-config-list"></div>
    <button id="reset-prompt-btn"></button>
    <div id="prompt-field-editor"></div>
    <div id="prompt-current-model"></div>
    <div id="prompt-model-hint"></div>
    <div id="prompt-dirty-flag" style="display:none"></div>
    <div id="save-status"></div>
    <div id="anki-status"></div>
    <button id="export-config-btn"></button>
    <button id="import-config-btn"></button>
    <input id="import-config-input" type="file" />
    <button id="reset-config-btn"></button>
    <select id="font-size-select"></select>
    <select id="text-align-select"></select>
    <select id="line-height-select"></select>
    <select id="language-select"></select>
    <div id="field-mapping"><div class="field-mapping-container"></div></div>
  `;

  await import(optionsModuleUrl);
  document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));
  await flushAsync();

  const providerSelect = document.getElementById("ai-provider");
  assert.ok(providerSelect, "应渲染 AI 提供商下拉框");

  const providers = getAllProviders();
  assert.equal(
    providerSelect.options.length,
    providers.length,
    "下拉框项数量应等于配置中的提供商数"
  );

  const providerContainer = document.getElementById(
    "provider-config-container"
  );
  assert.equal(
    providerContainer.children.length,
    providers.length,
    "应为每个提供商生成独立配置面板"
  );

  const activeProviderId = providerSelect.value;
  providers.forEach((provider) => {
    const section = document.getElementById(`config-${provider.id}`);
    assert.ok(section, `应生成 ${provider.id} 对应的面板`);
    const expectedDisplay =
      provider.id === activeProviderId ? "block" : "none";
    assert.equal(
      section.style.display || "block",
      expectedDisplay,
      `${provider.id} 面板显示状态应与选择同步`
    );
    const meta = section.querySelector('[data-role="provider-health-meta"]');
    assert.ok(meta, "健康状态应该渲染在面板中");
    assert.match(
      meta.textContent,
      /状态：健康/,
      "初始健康状态应来自配置"
    );
  });

  const testButton = providerContainer.querySelector(
    `button[data-provider="${activeProviderId}"][data-action="test-provider"]`
  );
  assert.ok(testButton, "应渲染测试按钮");
  testButton.click();
  await flushAsync();

  assert.deepEqual(
    lastTestRequest,
    {
      providerId: activeProviderId,
      apiKey: `${activeProviderId}-key`,
      modelName:
        sampleConfig.aiConfig.models[activeProviderId].modelName,
    },
    "测试连接应带上当前提供商的 API Key 与模型"
  );

  const apiKeyInput = document.getElementById(`${activeProviderId}-api-key`);
  apiKeyInput.type = "text";
  apiKeyInput.value = "updated-key";
  apiKeyInput.dispatchEvent(new Event("input", { bubbles: true }));

  const modelInput = document.getElementById(
    `${activeProviderId}-model-name`
  );
  modelInput.value = "updated-model";

  const urlInput = document.getElementById(`${activeProviderId}-api-url`);
  urlInput.value = "https://updated.example.com/v1";

  const requestedOrigins = [];
  const originalRequest = chrome.permissions.request;
  chrome.permissions.request = (descriptor, callback) => {
    requestedOrigins.push(...(descriptor?.origins ?? []));
    return originalRequest.call(chrome.permissions, descriptor, callback);
  };

  try {
    document.getElementById("save-btn").click();
    await flushAsync();
    await waitForCondition(() => saveCallCount > 0);

    assert.equal(saveCallCount, 1, "保存流程应调用存储层一次");
    assert.ok(savedConfig, "保存的配置应存在");
    assert.equal(
      savedConfig.aiConfig.provider,
      activeProviderId,
      "保存的激活提供商应与选择一致"
    );
    assert.equal(
      savedConfig.aiConfig.models[activeProviderId].apiKey,
      "updated-key",
      "保存结果应包含更新后的 API Key"
    );
    assert.equal(
      savedConfig.aiConfig.models[activeProviderId].modelName,
      "updated-model",
      "保存结果应包含更新后的模型名称"
    );
    assert.equal(
      savedConfig.aiConfig.models[activeProviderId].apiUrl,
      "https://updated.example.com/v1",
      "保存结果应包含更新后的 API 地址"
    );
    assert.deepEqual(
      requestedOrigins,
      ["https://updated.example.com/*"],
      "保存流程应请求新的域名访问权限"
    );
    assert.deepEqual(
      savedConfig.aiConfig.fallbackOrder,
      providers.map((provider) => provider.id),
      "回退顺序应保持与配置一致"
    );
  } finally {
    chrome.permissions.request = originalRequest;
  }

  delete globalThis.__ankiWordOptionsDeps;
  promptStore.clear();
});
