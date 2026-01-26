// ankiconnect.js - AnkiConnect API Wrapper
// Documentation: https://git.sr.ht/~foosoft/anki-connect

import { ANKI_CONNECT_DEFAULT_URL, ANKI_CONNECT_VERSION } from "./constants.js";

/**
 * 向 AnkiConnect 发送请求的通用函数
 * @param {string} action - API action 名称
 * @param {object} [params={}] - API action 参数
 * @returns {Promise<any>} - 返回 AnkiConnect 的响应
 */
async function invoke(action, params = {}) {
	const response = await fetch(ANKI_CONNECT_DEFAULT_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }),
	});

	if (!response.ok) {
		throw new Error(`HTTP error! status: ${response.status}`);
	}

	const data = await response.json();

	// AnkiConnect 在其响应体中报告错误
	if (data.error) {
		throw new Error(data.error);
	}

	return data;
}

/**
 * 测试与 AnkiConnect 的连接
 * @returns {Promise<{result: string, error: null}|{result: null, error: string}>}
 */
export async function testConnection() {
	try {
		const response = await invoke("version");
		return { result: response.result, error: null };
	} catch (e) {
		return { result: null, error: e.message };
	}
}

/**
 * 在 Anki 中添加一个新笔记 (卡片)
 * @param {object} noteData - 笔记数据
 * @param {string} noteData.deckName - 牌组名称
 * @param {string} noteData.modelName - 模板名称
 * @param {object} noteData.fields - 字段内容, e.g., { Front: 'word', Back: 'definition' }
 * @param {string[]} noteData.tags - 标签数组
 * @returns {Promise<{result: number, error: null}|{result: null, error: string}>} - 返回新笔记的ID或错误
 */
export async function addNote(noteData) {
	try {
		const response = await invoke("addNote", { note: noteData });
		return { result: response.result, error: null };
	} catch (e) {
		return { result: null, error: e.message };
	}
}

/**
 * 获取所有牌组的名称
 * @returns {Promise<{result: string[], error: null}|{result: null, error: string}>}
 */
export async function getDeckNames() {
	try {
		const response = await invoke("deckNames");
		return { result: response.result, error: null };
	} catch (e) {
		return { result: null, error: e.message };
	}
}

/**
 * 获取所有模板的名称
 * @returns {Promise<{result: string[], error: null}|{result: null, error: string}>}
 */
export async function getModelNames() {
	try {
		const response = await invoke("modelNames");
		return { result: response.result, error: null };
	} catch (e) {
		return { result: null, error: e.message };
	}
}

/**
 * 获取所有模板的名称和ID映射
 * @returns {Promise<{result: Object, error: null}|{result: null, error: string}>}
 */
export async function getModelNamesAndIds() {
	try {
		const response = await invoke("modelNamesAndIds");
		return { result: response.result, error: null };
	} catch (e) {
		return { result: null, error: e.message };
	}
}

/**
 * 获取特定模板的字段名称
 * @param {string} modelName - 模板名称
 * @returns {Promise<{result: string[], error: null}|{result: null, error: string}>}
 */
export async function getModelFieldNames(modelName) {
	try {
		const response = await invoke("modelFieldNames", { modelName: modelName });
		return { result: response.result, error: null };
	} catch (e) {
		return { result: null, error: e.message };
	}
}
