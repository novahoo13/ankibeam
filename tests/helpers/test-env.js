import { JSDOM } from "jsdom";
import { fetch, Headers, Request, Response } from "undici";
import { getAllManifestHostPermissions } from "../../utils/providers.config.js";

if (!globalThis.window) {
  const dom = new JSDOM("<!doctype html><html lang='ja'><body></body></html>", {
    url: "https://example.invalid/",
  });

  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.HTMLInputElement = dom.window.HTMLInputElement;
  globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
  globalThis.Event = dom.window.Event;
  globalThis.CustomEvent = dom.window.CustomEvent;

  if (typeof globalThis.navigator === "undefined") {
    Object.defineProperty(globalThis, "navigator", {
      value: dom.window.navigator,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }
}

if (typeof globalThis.fetch !== "function") {
  globalThis.fetch = fetch;
  globalThis.Headers = Headers;
  globalThis.Request = Request;
  globalThis.Response = Response;
}

const chromeStorage = new Map();

function normalizeOrigins(origins) {
  if (!origins) {
    return [];
  }
  if (Array.isArray(origins)) {
    return origins.filter((origin) => typeof origin === "string" && origin);
  }
  return [];
}

function ensureChromeNamespace() {
  if (!globalThis.chrome) {
    globalThis.chrome = {};
  }

  if (!globalThis.chrome.runtime) {
    globalThis.chrome.runtime = {
      lastError: null,
      sendMessage: () => {},
    };
  }

  if (!globalThis.chrome.storage) {
    globalThis.chrome.storage = {};
  }

  if (!globalThis.chrome.storage.local) {
    globalThis.chrome.storage.local = {
      get(keys) {
        if (keys === null || keys === undefined) {
          return Promise.resolve(Object.fromEntries(chromeStorage));
        }
        if (Array.isArray(keys)) {
          const result = {};
          for (const key of keys) {
            if (chromeStorage.has(key)) {
              result[key] = chromeStorage.get(key);
            }
          }
          return Promise.resolve(result);
        }
        if (typeof keys === "string") {
          return Promise.resolve(
            chromeStorage.has(keys) ? { [keys]: chromeStorage.get(keys) } : {},
          );
        }
        if (typeof keys === "object") {
          const result = {};
          for (const [key, defaultValue] of Object.entries(keys)) {
            result[key] = chromeStorage.has(key)
              ? chromeStorage.get(key)
              : defaultValue;
          }
          return Promise.resolve(result);
        }
        return Promise.resolve({});
      },
      set(items) {
        for (const [key, value] of Object.entries(items)) {
          chromeStorage.set(key, value);
        }
        return Promise.resolve();
      },
      remove(keys) {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const key of list) {
          chromeStorage.delete(key);
        }
        return Promise.resolve();
      },
      clear() {
        chromeStorage.clear();
        return Promise.resolve();
      },
    };
  }

  if (!globalThis.chrome.permissions) {
    const grantedOrigins = new Set(getAllManifestHostPermissions());
    globalThis.chrome.permissions = {
      contains(descriptor, callback) {
        const origins = normalizeOrigins(descriptor?.origins);
        const result = origins.every((origin) => grantedOrigins.has(origin));
        setTimeout(() => callback(result), 0);
      },
      request(descriptor, callback) {
        const origins = normalizeOrigins(descriptor?.origins);
        origins.forEach((origin) => grantedOrigins.add(origin));
        setTimeout(() => callback(true), 0);
      },
      remove(descriptor, callback) {
        const origins = normalizeOrigins(descriptor?.origins);
        origins.forEach((origin) => grantedOrigins.delete(origin));
        setTimeout(() => callback(true), 0);
      },
    };
  }
}

ensureChromeNamespace();

export function resetChromeStorage() {
  chromeStorage.clear();
}
