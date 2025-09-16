// popup.js - ポップアップ画面
// 目的: 入力テキストの解析と結果表示のUI更新

import { parseText } from "../utils/ai-service.js";
import { addNote, getModelFieldNames } from "../utils/ankiconnect.js";
import { loadConfig } from "../utils/storage.js";
// import { i18n } from '../utils/i18n.js'; // 国際化（未使用）

// 現在の設定（ロード後に格納）
let config = {};

// ステータスメッセージのタイマー
let statusTimer = null;

document.addEventListener("DOMContentLoaded", () => {
	// 初期化: 設定ロードとイベント登録
	initialize();
});

/**
 * 初期化処理
 */
async function initialize() {
	// 設定をロードし、後続処理で使用する
	config = (await loadConfig()) || {};
	console.log("設定をロードしました:", config);

	// イベント登録
	document.getElementById("parse-btn").addEventListener("click", handleParse);
	document
		.getElementById("write-btn")
		.addEventListener("click", handleWriteToAnki);

	// TODO: ユーザー設定に基づく初期UI
	// TODO: 国際化
}

/**
 * 解析ボタン ハンドラ
 */
async function handleParse() {
	const textInput = document.getElementById("text-input").value;
	if (!textInput.trim()) {
		updateStatus("请输入要解析的文本", "error");
		return;
	}

	// UI: ローディング表示
	setUiLoading(true, "解析中...");

	try {
		// カスタムプロンプト（任意）
		const customPrompt = config?.promptTemplates?.custom;

		const result = await parseText(textInput, customPrompt);

		// 出力フィールドへ反映
		document.getElementById("front-input").value = result.front || "";
		document.getElementById("back-input").value = result.back || "";

		// UI: 書き込みボタン有効化
		document.getElementById("write-btn").disabled = false;
		updateStatus("解析完成", "success");
	} catch (error) {
		console.error("解析出错:", error);
		updateStatus(`解析出错: ${error.message}`, "error");
	} finally {
		// UI: ローディング解除
		//setUiLoading(false);
	}
}

/**
 * 写入到 Anki 按钮 ハンドラ
 */
async function handleWriteToAnki() {
	const front = document.getElementById("front-input").value;
	const back = document.getElementById("back-input").value;

	if (!front || !back) {
		updateStatus("请填写正反面内容", "error");
		return;
	}

	// UI: ローディング表示
	setUiLoading(true, "正在写入 Anki...");
	document.getElementById("write-btn").disabled = true;

	try {
		// 設定からデフォルト値を取得
		const deckName = config?.ankiConfig?.defaultDeck || "Default";
		const modelName = config?.ankiConfig?.defaultModel || "Basic";
		const tags = config?.ankiConfig?.defaultTags || [];

		// HTML にラップ（改行→<br>）
		const frontHtml = wrapContentWithStyle(front);
		const backHtml = wrapContentWithStyle(back);

		// モデルのフィールド名
		const fieldNames = config?.ankiConfig?.modelFields;
		if (!fieldNames || fieldNames.length < 2) {
			throw new Error("未获取到模型字段，请先在设置页保存配置");
		}

		// フィールドにセット
		const fields = {};
		fields[fieldNames[0]] = frontHtml; // 正面
		fields[fieldNames[1]] = backHtml; // 背面

		const noteData = {
			deckName: deckName,
			modelName: modelName,
			fields: fields,
			tags: tags,
		};

		const result = await addNote(noteData);
		if (result.error) {
			throw new Error(result.error);
		}
		updateStatus(`已写入成功 (ID: ${result.result})`, "success");
	} catch (error) {
		console.error("写入 Anki 出错:", error);
		updateStatus(`写入出错: ${error.message}`, "error");
	} finally {
		//setUiLoading(false);
		document.getElementById("write-btn").disabled = false;
	}
}

/**
 * UI ローディング表示
 * @param {boolean} isLoading ローディング中か
 * @param {string} [message=''] ステータスメッセージ
 */
function setUiLoading(isLoading, message = "") {
	document.getElementById("parse-btn").disabled = isLoading;
	document.getElementById("write-btn").disabled = isLoading;
	// TODO: スピナー表示を追加予定
	updateStatus(message, "loading");
}

/**
 * コンテンツを装飾して HTML に変換
 * @param {string} content - 元テキスト
 * @returns {string} - 装飾後の HTML
 */
function wrapContentWithStyle(content) {
	// 設定からスタイル取得
	const styleConfig = config?.styleConfig || {};
	const fontSize = styleConfig.fontSize || "14px";
	const textAlign = styleConfig.textAlign || "left";
	const lineHeight = styleConfig.lineHeight || "1.4";

	// 改行を <br> に変換
	const contentWithBreaks = content.replace(/\n/g, "<br>");

	// ラップして返す
	return `<div style="font-size: ${fontSize}; text-align: ${textAlign}; line-height: ${lineHeight};">${contentWithBreaks}</div>`;
}

/**
 * ステータス更新
 * @param {string} message - メッセージ
 * @param {'success'|'error'|'loading'|''} type - 種別
 */
function updateStatus(message, type = "") {
	const statusElement = document.getElementById("status-message");
	statusElement.textContent = message;
	statusElement.className = `status-${type}`;

	// 既存タイマーをクリア
	if (statusTimer) {
		clearTimeout(statusTimer);
		statusTimer = null;
	}

	// 成功/失敗は2秒後に消す
	if (type === "success" || type === "error") {
		statusTimer = setTimeout(() => {
			statusElement.textContent = "";
			statusElement.className = "";
			statusTimer = null;
		}, 2000);
	}
}
