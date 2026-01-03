/**
 * @fileoverview 配置服务 (ConfigService)
 *
 * 负责统一管理应用程序的配置状态，提供单例访问点。
 * 解决通过直接 storage 读写导致的竞态条件和数据不一致问题。
 * 实现"读-改-写"原子化操作策略，并提供解密后的配置变更通知。
 */

import { loadConfig, saveConfig } from "../utils/storage.js";

class ConfigService {
	constructor() {
		this.cache = null;
		this.listeners = new Set();
		this.initPromise = null;
		this.isInternalUpdate = false;

		// 监听来自其他上下文（如 Options 页或 Popup）的存储变更
		if (chrome && chrome.storage && chrome.storage.onChanged) {
			chrome.storage.onChanged.addListener((changes, area) => {
				if (area === "local" && changes.ankiWordAssistantConfig) {
					this._handleStorageChange(changes.ankiWordAssistantConfig);
				}
			});
		}
	}

	/**
	 * 初始化服务，加载配置到缓存
	 * @returns {Promise<Object>} 当前配置对象
	 */
	async init() {
		if (this.cache) return this.cache;
		// 避免并发初始化
		if (this.initPromise) return this.initPromise;

		this.initPromise = (async () => {
			try {
				this.cache = await loadConfig();
			} catch (error) {
				console.error("[ConfigService] 初始化加载失败:", error);
				throw error;
			} finally {
				this.initPromise = null;
			}
			return this.cache;
		})();

		return this.initPromise;
	}

	/**
	 * 获取配置
	 * @param {string} [path] - 可选的属性路径（例如 'ui.fieldDisplayMode'），不传则返回完整配置
	 * @returns {Promise<any>} 配置值
	 */
	async get(path = null) {
		if (!this.cache) await this.init();

		if (!path) return { ...this.cache };

		return path.split(".").reduce((obj, key) => obj?.[key], this.cache);
	}

	/**
	 * 更新配置
	 * 采用 读取-合并-保存 的策略来减少竞态条件
	 * @param {Function} updater - 更新函数，接收当前配置，返回部分或全部更新
	 * @returns {Promise<Object>} 更新后的完整配置
	 */
	async update(updater) {
		// 1. 获取最新配置（从存储重新读取，以防缓存过期）
		const latest = await loadConfig();

		// 2. 计算更新
		const updates = updater(latest);
		if (!updates) return latest; // 无变更

		// 3. 合并更新
		// 简单的深层合并实现，或者针对特定顶层键的直接替换
		const merged = this._deepMerge(latest, updates);

		// 4. 保存
		this.isInternalUpdate = true;
		try {
			await saveConfig(merged);

			// 5. 更新缓存
			this.cache = merged;

			// 6. 通知监听器
			this._notifyListeners(this.cache);
		} finally {
			// 延迟重置标志，以防止 storage.onChanged 立即触发（虽然是异步的）
			setTimeout(() => {
				this.isInternalUpdate = false;
			}, 100);
		}

		return merged;
	}

	/**
	 * 订阅配置变更
	 * @param {Function} listener - 回调函数 (newConfig) => void
	 * @returns {Function} 取消订阅函数
	 */
	subscribe(listener) {
		this.listeners.add(listener);
		// 如果已有缓存，立即回调一次当前状态？
		// 通常不需要，订阅者应该在订阅后主动 get 一次，或者我们在 init 后只通知变更
		return () => this.listeners.delete(listener);
	}

	/**
	 * 内部：处理存储变更事件
	 */
	async _handleStorageChange(change) {
		// 如果是本服务发起的更新，则忽略（已在 update 方法中从内存更新了）
		// 但考虑到多窗口环境（popup vs content），这里不能简单忽略
		// 实际上 _handleStorageChange 主要是为了响应 *外部* 环境的修改

		if (this.isInternalUpdate) {
			// 本地发起的变更，已经在 update() 中处理了通知，这里可以跳过
			// 除非我们需要确认 persistence 成功
			return;
		}

		// 重新加载以获取解密后的数据
		// change.newValue 是加密的，不能直接使用
		const newConfig = await loadConfig();

		// 检查是否有实质性变更
		if (JSON.stringify(newConfig) !== JSON.stringify(this.cache)) {
			this.cache = newConfig;
			this._notifyListeners(newConfig);
		}
	}

	_notifyListeners(config) {
		this.listeners.forEach((listener) => {
			try {
				listener({ ...config });
			} catch (e) {
				console.error("[ConfigService] Listener 错误:", e);
			}
		});
	}

	/**
	 * 简单的深层合并辅助函数
	 */
	_deepMerge(target, source) {
		const output = { ...target };
		if (isObject(target) && isObject(source)) {
			Object.keys(source).forEach((key) => {
				if (isObject(source[key])) {
					if (!(key in target)) {
						Object.assign(output, { [key]: source[key] });
					} else {
						output[key] = this._deepMerge(target[key], source[key]);
					}
				} else {
					Object.assign(output, { [key]: source[key] });
				}
			});
		}
		return output;
	}
}

function isObject(item) {
	return item && typeof item === "object" && !Array.isArray(item);
}

// 导出单例
export const configService = new ConfigService();
