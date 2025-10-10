// providers.config.js - AI提供商配置的集中管理

const GOOGLE_SALT = new Uint8Array([
    18, 24, 193, 131, 8, 11, 20, 153, 22, 163, 3, 19, 84, 134, 103, 174,
  ]);

const OPENAI_SALT = new Uint8Array([
    45, 67, 89, 12, 34, 56, 78, 90, 123, 145, 167, 189, 211, 233, 255, 21,
  ]);

const ANTHROPIC_SALT = new Uint8Array([
    98, 76, 54, 32, 10, 87, 65, 43, 21, 99, 77, 55, 33, 11, 89, 67,
  ]);

// manifest中始终需要的主机权限
const BASE_HOST_PERMISSIONS = Object.freeze([
  "http://127.0.0.1:8765/*",
]);

const DEFAULT_PROVIDER_ID = "google";
const FALLBACK_ORDER = Object.freeze(["google", "openai", "anthropic"]);

export const DEFAULT_RETRY_POLICY = Object.freeze({
  maxAttempts: 3,
  baseDelayMs: 200,
  backoffFactor: 2,
});

export const DEFAULT_HEALTH_CHECK = Object.freeze({
  prompt: "これは接続テストです。短い応答を返してください。",
  options: Object.freeze({
    maxTokens: 16,
    temperature: 0,
  }),
});

function normalizeBaseUrl(baseUrl) {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
}

function ensureLeadingSlash(path) {
  if (!path) {
    return "";
  }
  return path.startsWith("/") ? path : `/${path}`;
}

const PROVIDERS = Object.freeze([
  Object.freeze({
    id: "google",
    label: "Google Gemini",
    compatMode: "google-generative",
    defaultModel: "gemini-2.5-flash-lite",
    testModel: "gemini-2.5-flash-lite",
    supportedModels: [
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
    ],
    api: {
      baseUrl: normalizeBaseUrl(
        "https://generativelanguage.googleapis.com/v1beta"
      ),
      pathBuilder: ({ modelName }) =>
        `/models/${modelName}:generateContent`,
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      }),
      payloadBuilder: ({ prompt, options = {} }) => {
        const generationDefaults = {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 2000,
          topP: 0.8,
          topK: 10,
        };

        const payload = {
          contents:
            options.contents ??
            [
              {
                parts: [
                  {
                    text: prompt,
                  },
                ],
              },
            ],
          generationConfig: {
            ...generationDefaults,
            ...(options.generationConfig ?? {}),
          },
        };

        if (options.systemInstruction) {
          payload.systemInstruction = options.systemInstruction;
        }

        if (options.safetySettings) {
          payload.safetySettings = options.safetySettings;
        }

        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }

        return payload;
      },
      responseParser: ({ data }) => {
        const candidate = data?.candidates?.[0];
        if (!candidate) {
          return "";
        }

        if (candidate.content?.parts?.length) {
          const part = candidate.content.parts.find(
            (item) => typeof item?.text === "string"
          );
          if (part?.text) {
            return part.text;
          }
        }

        if (candidate.content?.length) {
          const legacyPart = candidate.content.find(
            (item) => typeof item?.text === "string"
          );
          if (legacyPart?.text) {
            return legacyPart.text;
          }
        }

        return "";
      },
    },
    encryptionSalt: GOOGLE_SALT,
    hostPermissions: Object.freeze([
      "https://generativelanguage.googleapis.com/*",
    ]),
    ui: Object.freeze({
      apiKeyLabel: "Google API Key",
      apiKeyPlaceholder: "AIza...",
      docsUrl: "https://ai.google.dev/gemini-api/docs",
      dashboardUrl: "https://aistudio.google.com/app/apikey",
    }),
    runtime: Object.freeze({
      retryPolicy: DEFAULT_RETRY_POLICY,
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  Object.freeze({
    id: "openai",
    label: "OpenAI GPT",
    compatMode: "openai-compatible",
    defaultModel: "gpt-4o",
    testModel: "gpt-4o-mini",
    supportedModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-5"],
    api: {
      baseUrl: normalizeBaseUrl("https://api.openai.com/v1"),
      pathBuilder: () => "/chat/completions",
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      }),
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName,
          messages:
            options.messages ??
            [
              {
                role: "user",
                content: prompt,
              },
            ],
          temperature: options.temperature ?? 0.3,
          max_tokens: options.maxTokens ?? 2000,
        };

        if (options.responseFormat) {
          payload.response_format = options.responseFormat;
        }

        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }

        return payload;
      },
      responseParser: ({ data }) =>
        data?.choices?.[0]?.message?.content ?? "",
    },
    encryptionSalt: OPENAI_SALT,
    hostPermissions: Object.freeze(["https://api.openai.com/*"]),
    ui: Object.freeze({
      apiKeyLabel: "OpenAI API Key",
      apiKeyPlaceholder: "sk-...",
      docsUrl: "https://platform.openai.com/docs/api-reference",
      dashboardUrl: "https://platform.openai.com/api-keys",
    }),
    runtime: Object.freeze({
      retryPolicy: DEFAULT_RETRY_POLICY,
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
  Object.freeze({
    id: "anthropic",
    label: "Anthropic Claude",
    compatMode: "anthropic-messages",
    defaultModel: "claude-3-7-sonnet-all",
    testModel: "claude-3-7-sonnet-all",
    supportedModels: [
      "claude-3-7-sonnet-all",
      "claude-sonnet-4-all",
      "claude-opus-4-all",
    ],
    api: {
      baseUrl: normalizeBaseUrl("https://api.anthropic.com/v1"),
      pathBuilder: () => "/messages",
      headers: ({ apiKey }) => ({
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }),
      payloadBuilder: ({ modelName, prompt, options = {} }) => {
        const payload = {
          model: modelName,
          max_tokens: options.maxTokens ?? 2000,
          temperature: options.temperature ?? 0.3,
          messages:
            options.messages ??
            [
              {
                role: "user",
                content: prompt,
              },
            ],
        };

        if (options.system) {
          payload.system = options.system;
        }

        if (options.extraPayload) {
          Object.assign(payload, options.extraPayload);
        }

        return payload;
      },
      responseParser: ({ data }) =>
        data?.content?.[0]?.text ??
        data?.content?.find((item) => typeof item?.text === "string")?.text ??
        "",
    },
    encryptionSalt: ANTHROPIC_SALT,
    hostPermissions: Object.freeze(["https://api.anthropic.com/*"]),
    ui: Object.freeze({
      apiKeyLabel: "Anthropic API Key",
      apiKeyPlaceholder: "sk-ant-...",
      docsUrl: "https://docs.anthropic.com/claude/reference/messages_post",
      dashboardUrl: "https://console.anthropic.com/settings/keys",
    }),
    runtime: Object.freeze({
      retryPolicy: DEFAULT_RETRY_POLICY,
      healthCheck: DEFAULT_HEALTH_CHECK,
    }),
  }),
]);

const PROVIDER_INDEX = new Map(
  PROVIDERS.map((provider) => [provider.id, provider])
);

export function getAllProviders() {
  return PROVIDERS;
}

export function getProviderById(providerId) {
  return PROVIDER_INDEX.get(providerId) ?? null;
}

export function getDefaultProviderId() {
  return DEFAULT_PROVIDER_ID;
}

export function getFallbackOrder() {
  return FALLBACK_ORDER;
}

export function getAllManifestHostPermissions() {
  const permissions = new Set(BASE_HOST_PERMISSIONS);
  for (const provider of PROVIDERS) {
    if (!Array.isArray(provider.hostPermissions)) {
      continue;
    }
    for (const origin of provider.hostPermissions) {
      if (typeof origin === "string" && origin.trim()) {
        permissions.add(origin.trim());
      }
    }
  }
  return Array.from(permissions).sort();
}

export function buildRequestConfig(providerConfig, context) {
  const apiConfig = providerConfig.api;
  const path = ensureLeadingSlash(apiConfig.pathBuilder(context));
  const baseUrl = context.overrideBaseUrl
    ? normalizeBaseUrl(context.overrideBaseUrl)
    : apiConfig.baseUrl;
  const url = `${baseUrl}${path}`;

  const headers = apiConfig.headers(context) ?? {};
  const payload = apiConfig.payloadBuilder(context);

  const init = {
    method: apiConfig.method ?? "POST",
    headers: { ...headers },
  };

  if (payload !== undefined) {
    init.body = typeof payload === "string" ? payload : JSON.stringify(payload);
  }

  if (context.options?.fetchOptions) {
    const { fetchOptions } = context.options;
    const extra = { ...fetchOptions };
    if (extra.headers) {
      init.headers = {
        ...init.headers,
        ...extra.headers,
      };
      delete extra.headers;
    }
    Object.assign(init, extra);
  }

  return {
    url,
    init,
    responseParser: apiConfig.responseParser,
    errorParser: apiConfig.errorParser,
  };
}


