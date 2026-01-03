// formatter.js
// 格式化工具

/**
 * 内容样式包装器
 * 将纯文本内容转换为带样式的HTML，用于在Anki中显示
 * @param {string} content - 原始文本内容
 * @param {object} styleConfig - 样式配置 (fontSize, textAlign, lineHeight)
 * @returns {string} 包装后的HTML字符串
 */
export function wrapContentWithStyle(content, styleConfig = {}) {
	const fontSize = styleConfig.fontSize || "14px";
	const textAlign = styleConfig.textAlign || "left";
	const lineHeight = styleConfig.lineHeight || "1.4";

	// 将换行符转换成 <br>
	const contentWithBreaks = content.replace(/\n/g, "<br>");

	// 包装后返回
	return `<div style="font-size: ${fontSize}; text-align: ${textAlign}; line-height: ${lineHeight};">${contentWithBreaks}</div>`;
}
