import json
from pathlib import Path


class MessageBuilder:
    def __init__(self):
        self.entries = []

    def add(self, key, zh_cn, description, placeholders=None, translations=None):
        self.entries.append(
            {
                "key": key,
                "zh_CN": zh_cn,
                "description": description,
                "placeholders": placeholders or [],
                "translations": translations or {},
            }
        )

    def build(self):
        locales = ["zh_CN", "en", "ja", "zh_TW"]
        messages_by_locale = {loc: {} for loc in locales}

        for entry in self.entries:
            key = entry["key"]
            description = entry["description"]
            placeholders = entry["placeholders"]
            translations = entry["translations"]

            placeholder_defs = {}
            placeholder_order = []
            for idx, ph in enumerate(placeholders, start=1):
                original_name = ph["name"]
                upper_name = original_name.upper()
                placeholder_order.append((original_name, upper_name, idx, ph))
                placeholder_defs[upper_name] = {
                    "content": f"${idx}",
                    "example": ph["example"],
                    "description": ph["description"],
                }

            for loc in locales:
                raw_message = translations.get(loc, entry["zh_CN"])
                final_message = raw_message
                for original_name, upper_name, _, _ in placeholder_order:
                    final_message = final_message.replace(
                        f"{{{original_name}}}", f"${upper_name}$"
                    )

                messages_by_locale[loc][key] = {
                    "message": final_message,
                    "description": description,
                }
                if placeholder_defs:
                    messages_by_locale[loc][key]["placeholders"] = placeholder_defs

        return messages_by_locale


def build_entries(builder: MessageBuilder) -> None:
    # Popup - static labels
    builder.add(
        "popup_app_title",
        "Anki 单词助手",
        "Popup 页面标题，用于 <title> 与头部标题",
    )
    builder.add(
        "popup_input_label",
        "输入文本",
        "Popup 文本输入区域的标签",
    )
    builder.add(
        "popup_input_placeholder",
        "粘贴或输入文本...",
        "Popup 文本输入框的占位提示",
    )
    builder.add(
        "popup_parse_button",
        "解析",
        "触发 AI 解析的按钮文本",
    )
    builder.add(
        "popup_write_button",
        "写入 Anki",
        "触发写入 Anki 的按钮文本",
    )

    # Popup - status & error messages
    builder.add(
        "popup_error_rate_limit",
        "检测到频繁错误，建议刷新页面或检查网络连接",
        "频繁错误时提示用户刷新或检查网络",
    )
    builder.add(
        "popup_error_network",
        "网络连接失败，请检查网络后重试",
        "网络异常时的提示",
    )
    builder.add(
        "popup_error_ai_config",
        "AI服务配置错误，请检查设置页面的API Key",
        "AI 服务凭据缺失或错误时的提示",
    )
    builder.add(
        "popup_error_ai_quota",
        "AI服务额度不足，请检查账户状态或更换服务商",
        "AI 服务额度耗尽时的提示",
    )
    builder.add(
        "popup_error_ai_format_retry",
        "AI解析格式错误，正在自动重试...",
        "AI 返回格式异常时的重试提示",
    )
    builder.add(
        "popup_error_ai_field_mismatch",
        "AI输出字段不匹配，请检查模板配置",
        "AI 返回字段与期望不符时的提示",
    )
    builder.add(
        "popup_error_ai_generic",
        "AI解析失败: {detail}",
        "AI 解析失败的通用提示，包含精简错误信息",
        placeholders=[
            {
                "name": "detail",
                "description": "精简后的错误说明",
                "example": "请求超时",
            }
        ],
    )
    builder.add(
        "popup_error_anki_launch",
        "请启动Anki并确保AnkiConnect插件已安装",
        "未启动 Anki 或插件缺失时的提示",
    )
    builder.add(
        "popup_error_anki_duplicate",
        "卡片内容重复，请修改后重试",
        "写入时出现重复内容的提示",
    )
    builder.add(
        "popup_error_anki_deck_missing",
        "指定的牌组不存在，请检查配置",
        "牌组不存在时的提示",
    )
    builder.add(
        "popup_error_anki_model_missing",
        "指定的模板不存在，请检查配置",
        "模板不存在时的提示",
    )
    builder.add(
        "popup_error_anki_generic",
        "Anki操作失败: {detail}",
        "Anki 操作失败的通用提示，包含精简错误信息",
        placeholders=[
            {
                "name": "detail",
                "description": "精简后的错误说明",
                "example": "连接超时",
            }
        ],
    )
    builder.add(
        "popup_error_config_load",
        "配置加载异常，已使用默认配置",
        "加载用户配置失败时使用默认配置的提示",
    )
    builder.add(
        "popup_error_dom_missing",
        "页面元素缺失，请刷新页面重试",
        "关键 DOM 元素缺失时的提示",
    )
    builder.add(
        "popup_error_field_empty",
        "请至少填写一个字段内容",
        "写入前未填写任何字段时的提示",
    )
    builder.add(
        "popup_error_field_generic",
        "字段处理错误: {detail}",
        "字段处理相关错误的通用提示",
        placeholders=[
            {
                "name": "detail",
                "description": "精简后的错误说明",
                "example": "字段格式不正确",
            }
        ],
    )
    builder.add(
        "popup_error_generic",
        "操作失败: {detail}",
        "未分类错误的通用提示",
        placeholders=[
            {
                "name": "detail",
                "description": "精简后的错误说明",
                "example": "未知错误",
            }
        ],
    )
    builder.add(
        "popup_confirm_retry",
        "{message}\n\n是否立即重试？",
        "错误后是否重试的确认弹窗",
        placeholders=[
            {
                "name": "message",
                "description": "上一条错误提示",
                "example": "AI 解析失败：请求超时",
            }
        ],
    )
    builder.add(
        "popup_hint_parse_network",
        "解析失败可能是临时网络问题",
        "解析失败的网络原因提示",
    )
    builder.add(
        "popup_hint_anki_connection",
        "Anki 操作失败可能是连接问题",
        "Anki 写入失败的连接原因提示",
    )
    builder.add(
        "popup_hint_retry_general",
        "操作失败可能是临时问题",
        "通用失败时的重试提示",
    )
    builder.add(
        "popup_confirm_reload",
        "{message}\n\n点击确定刷新页面，取消继续使用",
        "严重错误后的刷新提示",
        placeholders=[
            {
                "name": "message",
                "description": "上一条错误提示",
                "example": "检测到频繁错误，建议刷新页面或检查网络连接",
            }
        ],
    )

    # Popup - status messages
    builder.add(
        "popup_status_ready",
        "准备就绪",
        "popup 状态栏：完成初始化",
    )
    builder.add(
        "popup_status_prompt_input",
        "请输入要解析的文本",
        "popup 状态栏：等待用户输入",
    )
    builder.add(
        "popup_status_parsing",
        "正在进行AI解析...",
        "popup 状态栏：解析进行中",
    )
    builder.add(
        "popup_status_no_fields_parse",
        "当前模板未配置可解析的字段，请在选项页完成设置。",
        "解析时检测到无字段配置",
    )
    builder.add(
        "popup_status_parsed",
        "解析完成",
        "popup 状态栏：解析完成",
    )
    builder.add(
        "popup_status_writing",
        "正在写入 Anki...",
        "popup 状态栏：写入进行中",
    )
    builder.add(
        "popup_status_no_fields_write",
        "当前模板未配置可写入的字段，请在选项页完成设置。",
        "写入时检测到无字段配置",
    )
    builder.add(
        "popup_status_collect_error",
        "字段收集失败：{detail}",
        "字段收集阶段的错误提示",
        placeholders=[
            {
                "name": "detail",
                "description": "错误详情列表",
                "example": "text-input 未找到",
            }
        ],
    )
    builder.add(
        "popup_warning_prefix",
        "警告: {detail}",
        "用于拼接警告详情的前缀",
        placeholders=[
            {
                "name": "detail",
                "description": "警告文字",
                "example": "解析结果为空",
            }
        ],
    )
    builder.add(
        "popup_status_validation_warning_header",
        "字段验证警告:",
        "字段验证警告标题",
    )
    builder.add(
        "popup_status_validation_continue",
        "{message}，继续写入...",
        "字段验证通过但带警告时的提示",
        placeholders=[
            {
                "name": "message",
                "description": "验证警告信息",
                "example": "卡片内容存在未填字段",
            }
        ],
    )
    builder.add(
        "popup_status_style_error",
        "样式包装失败: {detail}",
        "样式包装阶段的错误提示",
        placeholders=[
            {
                "name": "detail",
                "description": "错误详情",
                "example": "DOM 元素不存在",
            }
        ],
    )
    builder.add(
        "popup_status_no_fillable_fields",
        "没有可写入的字段内容",
        "写入前未收集到任何字段时的提示",
    )
    builder.add(
        "popup_status_ready_to_write",
        "准备写入 Anki:",
        "写入前的提示前缀",
    )
    builder.add(
        "popup_status_write_success",
        "写入成功",
        "写入完成后的提示",
    )
    builder.add(
        "popup_status_no_configured_fields",
        "当前模板未配置字段，请在选项页完成配置。",
        "任意阶段检测到无字段配置的提示",
    )
    builder.add(
        "popup_status_legacy_fallback_failed",
        "回退到legacy模式也失败: {detail}",
        "Legacy 回退失败时的提示",
        placeholders=[
            {
                "name": "detail",
                "description": "错误详情",
                "example": "DOM 元素缺失",
            }
        ],
    )
    builder.add(
        "popup_status_config_loaded",
        "用户配置加载完成:",
        "用户配置加载完成时的提示前缀",
    )
    builder.add(
        "popup_status_collect_complete",
        "字段收集完成:",
        "字段收集成功时的提示前缀",
    )
    builder.add(
        "popup_status_collect_failed",
        "字段收集失败:",
        "字段收集失败时的提示前缀",
    )
    builder.add(
        "popup_status_validation_failed",
        "字段验证失败:",
        "字段验证失败时的提示前缀",
    )
    builder.add(
        "popup_status_parse_result_empty",
        "AI 解析结果为空或格式无效",
        "AI 返回结果为空或格式错误的提示",
    )
    builder.add(
        "popup_status_field_names_invalid",
        "字段名数组为空或无效",
        "动态字段名无效时的提示",
    )

    # Popup - dynamic field UI messages
    builder.add(
        "popup_dynamic_fields_missing",
        "当前未配置可填充的字段，请先在选项页完成字段配置。",
        "动态字段为空时在容器内展示的提示",
    )
    builder.add(
        "popup_dynamic_field_placeholder",
        "AI将自动填充此字段...",
        "动态字段 textarea 的占位提示",
    )
    builder.add(
        "popup_field_preview",
        "已填充: {value}",
        "字段预览内容前缀",
        placeholders=[
            {
                "name": "value",
                "description": "截断后的字段内容",
                "example": "example text...",
            }
        ],
    )
    builder.add(
        "popup_field_tag_pending_label",
        "待填充",
        "字段 chip 的待填充状态标签",
    )
    builder.add(
        "popup_field_tag_filled",
        "已填充: {field}",
        "字段 chip 的已填充状态文本",
        placeholders=[
            {
                "name": "field",
                "description": "字段名称",
                "example": "释义",
            }
        ],
    )
    builder.add(
        "popup_field_tag_pending",
        "待填充: {field}",
        "字段 chip 的未填充状态文本",
        placeholders=[
            {
                "name": "field",
                "description": "字段名称",
                "example": "例句",
            }
        ],
    )
    builder.add(
        "popup_field_progress",
        "已填充 {filled}/{total} 个字段",
        "字段填充进度信息",
        placeholders=[
            {
                "name": "filled",
                "description": "已填充字段数量",
                "example": "2",
            },
            {
                "name": "total",
                "description": "字段总数",
                "example": "5",
            },
        ],
    )
    builder.add(
        "popup_field_all_empty_warning",
        "警告：所有字段都为空，请检查 AI 解析结果",
        "所有字段为空时的警告",
    )
    builder.add(
        "popup_field_empty_count",
        "({count} 个字段为空)",
        "显示空字段数量的提示",
        placeholders=[
            {
                "name": "count",
                "description": "为空的字段数量",
                "example": "3",
            }
        ],
    )
    builder.add(
        "popup_field_missing_dom_prefix",
        "缺失DOM元素:",
        "缺失 DOM 元素列表前缀",
    )
    builder.add(
        "popup_field_missing_dom_summary",
        "[{count} 个元素缺失]",
        "缺失 DOM 元素数量总结",
        placeholders=[
            {
                "name": "count",
                "description": "缺失的元素数量",
                "example": "2",
            }
        ],
    )
    builder.add(
        "popup_dynamic_fill_complete",
        "动态字段填充完成:",
        "动态字段填充完成时的提示前缀",
    )
    builder.add(
        "popup_dynamic_fill_error",
        "填充动态字段时发生错误:",
        "动态字段填充错误提示前缀",
    )
    builder.add(
        "popup_field_fill_failed",
        "字段填充失败: {detail}",
        "字段填充失败的详细提示",
        placeholders=[
            {
                "name": "detail",
                "description": "错误详情",
                "example": "字段示例未找到",
            }
        ],
    )
    builder.add(
        "popup_field_not_found",
        "找不到字段元素: {id} ({label})",
        "动态字段对应的 DOM 元素缺失时的提示",
        placeholders=[
            {
                "name": "id",
                "description": "字段元素 ID",
                "example": "dynamic-field-1",
            },
            {
                "name": "label",
                "description": "字段标签名称",
                "example": "释义",
            },
        ],
    )

    # Popup - retry hints
    builder.add(
        "popup_retry_hint_parse",
        "解析失败可能是临时网络问题",
        "解析失败的附加提示",
    )
    builder.add(
        "popup_retry_hint_anki",
        "Anki 操作失败可能是连接问题",
        "Anki 失败的附加提示",
    )
    builder.add(
        "popup_retry_hint_generic",
        "操作失败可能是临时问题",
        "通用失败的附加提示",
    )

    # Options - 页面与导航
    builder.add(
        "options_page_title",
        "设置",
        "Options 页面 <title> 文本",
    )
    builder.add(
        "options_page_heading",
        "设置中心",
        "Options 页面主标题",
    )
    builder.add(
        "options_tab_ai",
        "AI 配置",
        "AI 设置面板的标签文本",
    )
    builder.add(
        "options_tab_anki",
        "Anki 连接",
        "Anki 设置面板的标签文本",
    )
    builder.add(
        "options_tab_prompt",
        "Prompt 配置",
        "Prompt 设置面板的标签文本",
    )
    builder.add(
        "options_tab_style",
        "样式设置",
        "界面样式设置面板的标签文本",
    )
    builder.add(
        "options_tab_system",
        "系统设置",
        "系统设置面板的标签文本",
    )
    builder.add(
        "options_section_choose_provider",
        "选择 AI 提供商",
        "AI 提供商选择段落标题",
    )
    builder.add(
        "options_section_prompt_by_model",
        "按模板配置 Prompt",
        "Prompt 配置段落标题",
    )
    builder.add(
        "options_section_prompt_instruction",
        "请在「Anki 连接」面板选择要编辑的模型，随后在这里自定义 Prompt。",
        "Prompt 配置区域的使用说明",
    )
    builder.add(
        "options_prompt_current_model",
        "当前模板：未选择",
        "Prompt 面板默认显示的当前模板提示",
    )
    builder.add(
        "options_prompt_field_select",
        "字段选择",
        "Prompt 面板字段选择区域标题",
    )
    builder.add(
        "options_prompt_field_select_hint",
        "点击字段切换选中状态",
        "Prompt 面板字段选择提示",
    )
    builder.add(
        "options_prompt_field_config",
        "字段配置",
        "Prompt 面板字段配置区域标题",
    )
    builder.add(
        "options_prompt_field_config_hint",
        "配置生成 AI 输出该字段所需的信息",
        "Prompt 面板字段配置说明",
    )
    builder.add(
        "options_prompt_custom_template",
        "自定义 Prompt 模板",
        "Prompt 自定义编辑区域标题",
    )
    builder.add(
        "options_prompt_template_placeholder",
        "请选择模型后编写对应的 Prompt。\n建议包含以下占位符：\n- {{INPUT_TEXT}} 表示用户输入\n- {{FIELD_SCHEMA}} 表示字段结构",
        "自定义 Prompt 编辑框占位提示",
    )
    builder.add(
        "options_prompt_reset_default",
        "重置为默认模板",
        "Prompt 区域重置按钮文本",
    )
    builder.add(
        "options_prompt_dirty_hint",
        "已修改，保存后生效",
        "Prompt 模板被修改后的提示",
    )
    builder.add(
        "options_prompt_generate_default",
        "测试连接并刷新模型",
        "Prompt 面板测试按钮文本",
    )
    builder.add(
        "options_label_deck",
        "牌组",
        "Anki 连接面板的牌组标签",
    )
    builder.add(
        "options_hint_test_anki_first",
        "请先测试 Anki 连接",
        "提示用户先测试 Anki 连接",
    )
    builder.add(
        "options_label_model",
        "模型",
        "Anki 连接面板的模型标签",
    )
    builder.add(
        "options_label_field_info",
        "字段信息",
        "Anki 连接面板字段信息区域标题",
    )
    builder.add(
        "options_label_language",
        "语言",
        "系统设置面板语言标签",
    )
    builder.add(
        "options_language_chinese_simplified",
        "简体中文",
        "语言下拉框中的简体中文选项",
    )
    builder.add(
        "options_section_config_management",
        "配置管理",
        "配置管理区域标题",
    )
    builder.add(
        "options_section_config_management_hint",
        "导出、导入或重置您的配置设置。注意：导出的配置文件不包含 API 密钥以确保安全。",
        "配置管理区域的说明文字",
    )
    builder.add(
        "options_button_export_config",
        "📤 导出配置",
        "导出配置按钮文本",
    )
    builder.add(
        "options_button_import_config",
        "📥 导入配置",
        "导入配置按钮文本",
    )
    builder.add(
        "options_button_reset_config",
        "🔄 重置配置",
        "重置配置按钮文本",
    )
    builder.add(
        "options_label_font_size",
        "字体大小",
        "样式设置面板字体大小标签",
    )
    builder.add(
        "options_font_size_small",
        "小 (12px)",
        "字体大小选项：小",
    )
    builder.add(
        "options_font_size_medium",
        "中 (14px)",
        "字体大小选项：中",
    )
    builder.add(
        "options_font_size_large",
        "大 (16px)",
        "字体大小选项：大",
    )
    builder.add(
        "options_font_size_xlarge",
        "更大 (18px)",
        "字体大小选项：更大",
    )
    builder.add(
        "options_label_text_align",
        "文本对齐",
        "样式设置面板文本对齐标签",
    )
    builder.add(
        "options_text_align_left",
        "左对齐",
        "文本对齐选项：左对齐",
    )
    builder.add(
        "options_text_align_center",
        "居中",
        "文本对齐选项：居中",
    )
    builder.add(
        "options_text_align_right",
        "右对齐",
        "文本对齐选项：右对齐",
    )
    builder.add(
        "options_label_line_height",
        "行高",
        "样式设置面板行高标签",
    )
    builder.add(
        "options_line_height_compact",
        "紧凑 (1.2)",
        "行高选项：紧凑",
    )
    builder.add(
        "options_line_height_normal",
        "适中 (1.4)",
        "行高选项：适中",
    )
    builder.add(
        "options_line_height_loose",
        "宽松 (1.6)",
        "行高选项：宽松",
    )
    builder.add(
        "options_section_style_preview",
        "样式预览",
        "样式预览区域标题",
    )
    builder.add(
        "options_style_preview_sample",
        "这是一个示例文本。",
        "样式预览区域示例文本第一行",
    )
    builder.add(
        "options_style_preview_description",
        "用于预览字体、对齐与行高效果。",
        "样式预览区域示例文本第二行",
    )
    builder.add(
        "options_button_save",
        "保存设置",
        "保存按钮文本",
    )

    # Options - 运行时提示与错误
    builder.add(
        "options_error_permission_denied",
        "未获得 {origin} 的访问权限，已取消保存。",
        "请求可选权限失败时的提示",
        placeholders=[
            {
                "name": "origin",
                "description": "被拒绝的域名模式",
                "example": "https://api.example.com/*",
            }
        ],
    )
    builder.add(
        "options_button_toggle_show",
        "显示",
        "API Key 显示按钮文本",
    )
    builder.add(
        "options_button_toggle_hide",
        "隐藏",
        "API Key 隐藏按钮文本",
    )
    builder.add(
        "options_helper_get_api_key",
        "获取 API Key：",
        "帮助提示：获取 API Key 的说明",
    )
    builder.add(
        "options_helper_docs_separator",
        " ｜ 文档：",
        "帮助提示中用于分隔文档链接的文字",
    )
    builder.add(
        "options_helper_docs_fallback",
        "参考文档：",
        "仅提供文档链接时显示的文字",
    )
    builder.add(
        "options_helper_api_docs",
        "API 文档",
        "API 文档链接的文本",
    )
    builder.add(
        "options_label_model_name",
        "模型名称",
        "模型名称输入框标签",
    )
    builder.add(
        "options_placeholder_model_example",
        "例如：{model}",
        "模型名称输入框示例提示",
        placeholders=[
            {
                "name": "model",
                "description": "提供商默认模型名称",
                "example": "gpt-4o-mini",
            }
        ],
    )
    builder.add(
        "options_placeholder_model_input",
        "输入模型名称",
        "模型名称输入框占位提示",
    )
    builder.add(
        "options_hint_model_common",
        "常用模型：{models}",
        "列出常用模型的提示",
        placeholders=[
            {
                "name": "models",
                "description": "常用模型列表",
                "example": "gpt-3.5-turbo、gpt-4o-mini",
            }
        ],
    )
    builder.add(
        "options_label_api_url",
        "API 地址",
        "API 地址输入框标签",
    )
    builder.add(
        "options_placeholder_api_url",
        "https://",
        "API 地址输入框占位提示",
    )
    builder.add(
        "options_hint_api_url_default",
        "默认：{url}",
        "API 地址默认值提示",
        placeholders=[
            {
                "name": "url",
                "description": "默认 API 地址",
                "example": "https://api.example.com/v1",
            }
        ],
    )
    builder.add(
        "options_button_test_provider",
        "测试 {provider} 连接",
        "测试提供商连接按钮文本",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商显示名称",
                "example": "OpenAI",
            }
        ],
    )
    builder.add(
        "options_status_not_tested",
        "尚未测试连接",
        "连接状态默认提示",
    )
    builder.add(
        "options_status_prefix",
        "状态：{status}",
        "提供商健康状态前缀",
        placeholders=[
            {
                "name": "status",
                "description": "提供商健康状态文本",
                "example": "健康",
            }
        ],
    )
    builder.add(
        "options_status_last_checked",
        "上次检查：{time}",
        "提供商最近检查时间提示",
        placeholders=[
            {
                "name": "time",
                "description": "最近检查时间文本",
                "example": "2025-01-10 12:00",
            }
        ],
    )
    builder.add(
        "options_status_reason",
        "原因：{reason}",
        "提供商异常的原因提示",
        placeholders=[
            {
                "name": "reason",
                "description": "异常原因说明",
                "example": "请求超时",
            }
        ],
    )
    builder.add(
        "options_status_health_ok",
        "健康",
        "提供商状态：健康",
    )
    builder.add(
        "options_status_health_error",
        "异常",
        "提供商状态：异常",
    )
    builder.add(
        "options_status_health_unknown",
        "未知",
        "提供商状态：未知",
    )
    builder.add(
        "options_prompt_no_fields",
        "当前模板未返回任何字段。",
        "Prompt 编辑器提示：无字段返回",
    )
    builder.add(
        "options_prompt_select_fields",
        "请选择需要输出的字段，并补全字段内容。",
        "Prompt 编辑器提示：提示选择字段",
    )
    builder.add(
        "options_prompt_config_placeholder",
        "请选择字段后配置字段内容。",
        "Prompt 编辑器配置区域的占位提示",
    )
    builder.add(
        "options_prompt_field_label",
        "字段内容",
        "Prompt 编辑器中字段内容标签",
    )
    builder.add(
        "options_prompt_field_placeholder",
        "描述该字段应包含的内容，例如输出结构、语气等要求",
        "Prompt 编辑器字段内容输入框占位提示",
    )
    builder.add(
        "options_prompt_rule_intro",
        "请严格按照下列要求生成输出。",
        "生成默认 Prompt 时的规则说明",
    )
    builder.add(
        "options_prompt_rule_field_definition",
        "字段返回内容定义：",
        "Prompt 规则：字段定义标题",
    )
    builder.add(
        "options_prompt_rule_field_fallback",
        "请生成与该字段相关的内容。",
        "Prompt 规则：字段占位符默认说明",
    )
    builder.add(
        "options_prompt_rule_output_format",
        "输出格式定义：",
        "Prompt 规则：输出格式标题",
    )
    builder.add(
        "options_prompt_rule_output_json",
        "请按照以下 JSON 结构返回结果，仅包含所列字段：",
        "Prompt 规则：JSON 输出要求",
    )
    builder.add(
        "options_prompt_rule_output_line",
        "  \"{field}\": \"请填入{field}的内容\"{suffix}",
        "Prompt 规则：JSON 字段定义",
        placeholders=[
            {
                "name": "field",
                "description": "字段名称",
                "example": "释义",
            },
            {
                "name": "suffix",
                "description": "逗号或空字符串",
                "example": ",",
            },
        ],
    )
    builder.add(
        "options_prompt_rule_notes",
        "注意事项：",
        "Prompt 规则：注意事项标题",
    )
    builder.add(
        "options_prompt_rule_note_json_only",
        "- 仅返回 JSON，不要包含额外解释。",
        "Prompt 规则：仅返回 JSON 提示",
    )
    builder.add(
        "options_prompt_rule_note_requirements",
        "- 确保各字段内容满足上文要求。",
        "Prompt 规则：满足要求提示",
    )
    builder.add(
        "options_prompt_error_field_required",
        "字段内容为必填项",
        "Prompt 字段内容未填写时的错误提示",
    )
    builder.add(
        "options_prompt_error_select_fields",
        "请选择至少一个要输出的字段。",
        "未选择任何字段时的提示",
    )
    builder.add(
        "options_prompt_error_field_empty",
        "字段“{field}”的内容不能为空。",
        "单个字段内容为空时的提示",
        placeholders=[
            {
                "name": "field",
                "description": "字段名称",
                "example": "例句",
            }
        ],
    )
    builder.add(
        "options_prompt_error_fields_empty",
        "以下字段内容不能为空：{fields}",
        "多个字段内容为空时的提示",
        placeholders=[
            {
                "name": "fields",
                "description": "以顿号连接的字段名称列表",
                "example": "释义、例句",
            }
        ],
    )
    builder.add(
        "options_prompt_status_ready",
        "字段配置已就绪。",
        "Prompt 字段配置完成提示",
    )
    builder.add(
        "options_prompt_status_generated",
        "已根据当前字段配置生成默认 Prompt。",
        "生成默认 Prompt 后的提示",
    )
    builder.add(
        "options_prompt_error_generate_first",
        "请先选择并配置字段，然后再生成默认 Prompt。",
        "生成默认 Prompt 前未配置字段的提示",
    )
    builder.add(
        "options_prompt_not_found",
        "未找到 Prompt 设置元素",
        "Prompt 相关 DOM 元素缺失时的警告",
    )
    builder.add(
        "options_prompt_current_model_label",
        "当前模板：{model}",
        "Prompt 面板当前选择模板显示",
        placeholders=[
            {
                "name": "model",
                "description": "当前模板名称",
                "example": "默认单词模板",
            }
        ],
    )
    builder.add(
        "options_prompt_hint_save_usage",
        "提示：保存设置后将在 popup 中使用此 Prompt。",
        "Prompt 面板提示：保存后生效",
    )
    builder.add(
        "options_export_status_running",
        "正在导出配置...",
        "导出配置进行中的提示",
    )
    builder.add(
        "options_export_status_success",
        "配置导出成功",
        "导出配置成功的提示",
    )
    builder.add(
        "options_export_status_failed",
        "配置导出失败：{error}",
        "导出配置失败的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误信息",
                "example": "权限被拒绝",
            }
        ],
    )
    builder.add(
        "options_import_status_running",
        "正在导入配置...",
        "导入配置进行中的提示",
    )
    builder.add(
        "options_import_error_json_invalid",
        "配置文件不是有效的 JSON",
        "导入配置时 JSON 无效的提示",
    )
    builder.add(
        "options_import_error_format_invalid",
        "配置文件格式不正确",
        "导入配置时结构无效的提示",
    )
    builder.add(
        "options_import_error_missing_ai_config",
        "配置文件缺少 aiConfig",
        "导入配置时缺少 aiConfig 的提示",
    )
    builder.add(
        "options_import_status_success",
        "配置导入成功，请重新配置 API 密钥",
        "导入配置成功后的提示",
    )
    builder.add(
        "options_import_status_failed",
        "配置导入失败：{error}",
        "导入配置失败的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误信息",
                "example": "文件解析失败",
            }
        ],
    )
    builder.add(
        "options_reset_confirm",
        "确定要重置所有配置吗？此操作不可撤销。",
        "重置配置前的确认提示",
    )
    builder.add(
        "options_reset_status_running",
        "正在重置配置...",
        "重置配置进行中的提示",
    )
    builder.add(
        "options_reset_status_success",
        "配置已重置为默认值",
        "重置配置成功的提示",
    )
    builder.add(
        "options_reset_status_failed",
        "重置配置失败：{error}",
        "重置配置失败的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误信息",
                "example": "写入失败",
            }
        ],
    )
    builder.add(
        "options_config_loaded",
        "配置加载完成。",
        "选项页面初始化完成提示",
    )
    builder.add(
        "options_error_missing_api_key",
        "请为当前提供商填写 API Key",
        "保存设置时缺少 API Key 的提示",
    )
    builder.add(
        "options_error_invalid_api_url",
        "API 地址格式不正确",
        "API 地址格式错误时的提示",
    )
    builder.add(
        "options_status_saving",
        "正在保存设置...",
        "保存设置时的状态提示",
    )
    builder.add(
        "options_save_status_success",
        "设置已保存",
        "保存设置成功后的提示",
    )
    builder.add(
        "options_save_status_failed",
        "保存出错：{error}",
        "保存设置失败时的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "权限被拒绝",
            }
        ],
    )
    builder.add(
        "options_warning_permission_declined",
        "域名权限请求被拒绝：{error}",
        "权限请求被拒绝的日志提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "User cancelled",
            }
        ],
    )

    # Options - 提供商测试相关
    builder.add(
        "options_test_running",
        "正在测试连接并刷新数据...",
        "测试 Anki 或 AI 连接时的提示",
    )
    builder.add(
        "options_test_success_with_version",
        "连接成功，AnkiConnect 版本: {version}",
        "Anki 测试成功后显示的版本信息",
        placeholders=[
            {
                "name": "version",
                "description": "AnkiConnect 返回的版本号",
                "example": "2.5.0",
            }
        ],
    )
    builder.add(
        "options_error_deck_select_placeholder",
        "请选择默认牌组",
        "牌组下拉框的占位选项",
    )
    builder.add(
        "options_error_model_select_placeholder",
        "请选择默认模型",
        "模型下拉框的占位选项",
    )
    builder.add(
        "options_mode_legacy_heading",
        "兼容模式",
        "Legacy 模式说明标题",
    )
    builder.add(
        "options_mode_legacy_description",
        "该模板字段数 ≤ 2，将使用传统的正面/背面模式。",
        "Legacy 模式说明正文",
    )
    builder.add(
        "options_mode_dynamic_heading",
        "动态字段模式",
        "动态字段模式说明标题",
    )
    builder.add(
        "options_mode_dynamic_description",
        "该模板支持多字段，AI 将自动填充所有字段。popup 页面将根据字段名智能生成对应的输入区域。",
        "动态字段模式说明正文",
    )
    builder.add(
        "options_error_fetch_decks",
        "读取牌组失败: {error}",
        "读取牌组失败提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "连接超时",
            }
        ],
    )
    builder.add(
        "options_error_fetch_models",
        "读取模型失败: {error}",
        "读取模型失败提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "权限不足",
            }
        ],
    )
    builder.add(
        "options_error_fetch_anki_data",
        "读取 Anki 数据出错: {error}",
        "读取 Anki 数据失败提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "请求被拒绝",
            }
        ],
    )
    builder.add(
        "options_error_provider_test_missing_key",
        "请先输入 API Key",
        "在未输入 API Key 时执行连接测试的提示",
    )
    builder.add(
        "options_error_provider_test_failed",
        "测试失败: {message}",
        "提供商连接测试失败提示",
        placeholders=[
            {
                "name": "message",
                "description": "失败原因",
                "example": "请求超时",
            }
        ],
    )
    builder.add(
        "options_status_provider_test_success",
        "连接测试成功",
        "提供商连接测试成功提示",
    )

    # utils/ai-service.js
    builder.add(
        "ai_service_error_unknown_provider",
        "未知的 AI 提供商: {provider}",
        "处理未知提供商时的错误提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "new-provider",
            }
        ],
    )
    builder.add(
        "ai_service_error_empty_response",
        "AI 响应内容为空",
        "AI 返回内容为空时的提示",
    )
    builder.add(
        "ai_service_error_parse_json",
        "无法解析 AI 返回的结果为 JSON 格式",
        "AI 返回无法解析为 JSON 时的提示",
    )
    builder.add(
        "ai_service_error_request_failed",
        "{provider} 请求失败: {error}",
        "AI 请求失败时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商名称",
                "example": "OpenAI",
            },
            {
                "name": "error",
                "description": "错误详情",
                "example": "Timeout",
            },
        ],
    )
    builder.add(
        "ai_service_error_parse_failed",
        "{provider} 响应解析失败: {error}",
        "AI 响应解析失败时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商名称",
                "example": "Anthropic",
            },
            {
                "name": "error",
                "description": "错误详情",
                "example": "Unexpected token <",
            },
        ],
    )
    builder.add(
        "ai_service_error_request_message",
        "{provider} 请求失败: {message}",
        "AI 请求失败时返回消息字符串的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商名称",
                "example": "Google Gemini",
            },
            {
                "name": "message",
                "description": "错误消息",
                "example": "invalid api key",
            },
        ],
    )
    builder.add(
        "ai_service_error_empty_body",
        "{provider} 响应内容为空",
        "AI 响应为空时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商名称",
                "example": "OpenAI",
            }
        ],
    )
    builder.add(
        "ai_service_error_missing_provider_config",
        "未找到提供商配置: {provider}",
        "当前提供商缺少配置时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "openai",
            }
        ],
    )
    builder.add(
        "ai_service_error_missing_api_key_active",
        "提供商 {provider} 的 API Key 尚未设置",
        "当前激活的提供商缺少 API Key 时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "anthropic",
            }
        ],
    )
    builder.add(
        "ai_service_error_missing_default_model_active",
        "提供商 {provider} 缺少默认模型配置",
        "当前激活的提供商缺少默认模型时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "openai",
            }
        ],
    )
    builder.add(
        "ai_service_error_request_generic",
        "AI 服务请求失败",
        "AI 请求失败的通用提示",
    )
    builder.add(
        "ai_service_error_missing_api_key",
        "提供商 {provider} 的 API Key 尚未设置",
        "处理请求时提供商缺少 API Key 的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "google",
            }
        ],
    )
    builder.add(
        "ai_service_error_missing_default_model",
        "提供商 {provider} 缺少默认模型配置",
        "处理请求时提供商缺少默认模型的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "anthropic",
            }
        ],
    )
    builder.add(
        "ai_service_prompt_classic",
        "请将以下单词查询结果解析为结构化数据。\n你的输出必须是一个纯粹的 JSON 对象，不要包含任何解释性文字或代码块标记。\nJSON 格式如下:\n{\n  \"front\": \"单词\",\n  \"back\": \"完整的单词查询结果（保留原始换行格式）\"\n}\n\n待解析的文本如下：\n---\n{input}\n---",
        "经典 Prompt 模式的请求文本",
        placeholders=[
            {
                "name": "input",
                "description": "用户输入文本",
                "example": "example word",
            }
        ],
    )
    builder.add(
        "ai_service_warn_missing_input_placeholder",
        "自定义 Prompt 中不存在 {{INPUT_TEXT}} 占位符，因此已将输入文本追加到末尾。",
        "自定义 Prompt 缺少 INPUT_TEXT 占位符时的警告",
    )
    builder.add(
        "ai_service_error_request_with_message",
        "AI 服务请求失败：{error}",
        "AI 服务失败并返回最后一个错误消息时的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "请求超时",
            }
        ],
    )
    builder.add(
        "ai_service_error_no_provider_available",
        "AI 服务请求失败：未找到可用的提供商",
        "所有提供商不可用时的提示",
    )
    builder.add(
        "ai_service_error_connection_test",
        "连接测试失败：{error}",
        "提供商连接测试失败的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "网络超时",
            }
        ],
    )
    builder.add(
        "ai_service_error_missing_api_key_test",
        "连接测试失败：API Key 尚未设置",
        "连接测试缺少 API Key 的提示",
    )
    builder.add(
        "ai_service_error_missing_default_model_test",
        "{provider} 缺少默认模型配置",
        "连接测试缺少默认模型时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商名称",
                "example": "OpenAI",
            }
        ],
    )
    builder.add(
        "ai_service_status_test_success",
        "{provider} 连接测试成功",
        "连接测试成功的信息",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商名称",
                "example": "Anthropic",
            }
        ],
    )
    builder.add(
        "ai_service_error_output_invalid_fields",
        "输出包含无效字段: {fields}",
        "AI 输出包含未预期字段时的提示",
        placeholders=[
            {
                "name": "fields",
                "description": "无效字段列表",
                "example": "unexpectedField",
            }
        ],
    )
    builder.add(
        "ai_service_error_output_all_empty",
        "AI 输出的所有字段都为空，请检查输入内容或重试",
        "AI 输出字段全部为空时的提示",
    )
    builder.add(
        "ai_service_error_parse_fail_message",
        "AI 解析失败：{error}",
        "AI 解析失败并返回错误对象的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误信息",
                "example": "无法解析 JSON",
            }
        ],
    )
    builder.add(
        "ai_service_error_parse_fail_unknown",
        "AI 解析失败：未知错误",
        "AI 解析失败且无错误详情时的提示",
    )

    # utils/field-handler.js
    builder.add(
        "field_handler_error_front_not_found",
        "找不到 front-input 元素",
        "Legacy 模式前字段元素缺失时的提示",
    )
    builder.add(
        "field_handler_error_back_not_found",
        "找不到 back-input 元素",
        "Legacy 模式背字段元素缺失时的提示",
    )
    builder.add(
        "field_handler_error_model_fields_invalid",
        "modelFields 必须是数组",
        "模型字段集合无效时的提示",
    )
    builder.add(
        "field_handler_error_field_element_missing",
        "找不到字段元素：{element} ({field})",
        "字段对应的 DOM 元素缺失时的提示",
        placeholders=[
            {
                "name": "element",
                "description": "字段 DOM 元素 ID",
                "example": "dynamic-field-example",
            },
            {
                "name": "field",
                "description": "字段名称",
                "example": "释义",
            },
        ],
    )
    builder.add(
        "field_handler_error_wrap_style",
        "样式包装失败：{error}",
        "字段样式包装失败时的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "DOMException",
            }
        ],
    )
    builder.add(
        "field_handler_status_collect_complete",
        "字段收集完成:",
        "字段收集完成日志前缀",
    )
    builder.add(
        "field_handler_status_collect_failed",
        "字段收集失败:",
        "字段收集失败日志前缀",
    )
    builder.add(
        "field_handler_error_field_object_invalid",
        "字段对象为空或无效",
        "字段对象校验失败提示",
    )
    builder.add(
        "field_handler_error_field_data_invalid",
        "字段数据无效",
        "字段数据结构无效的提示",
    )
    builder.add(
        "field_handler_error_no_fields_found",
        "没有找到任何字段",
        "未找到字段集合时的提示",
    )
    builder.add(
        "field_handler_error_field_list_empty",
        "字段列表为空",
        "字段列表为空时的提示",
    )
    builder.add(
        "field_handler_error_missing_dom_count",
        "缺失{count}个 DOM 元素",
        "字段渲染时缺失 DOM 元素的提示",
        placeholders=[
            {
                "name": "count",
                "description": "缺失的元素数量",
                "example": "3",
            }
        ],
    )
    builder.add(
        "field_handler_error_field_contains_html",
        "字段“{field}”可能包含过多 HTML 标签",
        "字段内容包含大量 HTML 时的提示",
        placeholders=[
            {
                "name": "field",
                "description": "字段名称",
                "example": "例句",
            }
        ],
    )
    builder.add(
        "field_handler_error_legacy_required_fields",
        "Legacy 模式下前两个字段都必须填写",
        "Legacy 模式字段校验提示",
    )
    builder.add(
        "field_handler_error_legacy_min_fields",
        "Legacy 模式需要至少两个字段",
        "Legacy 模式字段数量不足提示",
    )
    builder.add(
        "field_handler_error_fill_front",
        "请填写正面内容",
        "Legacy 模式缺少正面内容提示",
    )
    builder.add(
        "field_handler_error_fill_back",
        "请填写背面内容",
        "Legacy 模式缺少背面内容提示",
    )
    builder.add(
        "field_handler_error_min_field_content",
        "至少需要填写一个字段内容",
        "动态模式至少填一项的提示",
    )
    builder.add(
        "field_handler_warning_few_fields",
        "填写字段较少 ({filled}/{total})",
        "字段填写数量较少时的提示",
        placeholders=[
            {
                "name": "filled",
                "description": "已填写数量",
                "example": "1",
            },
            {
                "name": "total",
                "description": "总字段数量",
                "example": "4",
            },
        ],
    )
    builder.add(
        "field_handler_warning_with_count",
        "验证通过，但有 {count} 个警告",
        "验证通过但存在警告时的提示",
        placeholders=[
            {
                "name": "count",
                "description": "警告数量",
                "example": "2",
            }
        ],
    )
    builder.add(
        "field_handler_warning_fields_filled",
        "验证通过，已填写 {count} 个字段",
        "验证通过并提示已填写数量",
        placeholders=[
            {
                "name": "count",
                "description": "已填写字段数量",
                "example": "3",
            }
        ],
    )
    builder.add(
        "field_handler_error_validation_failed",
        "字段验证失败:",
        "字段验证失败日志前缀",
    )
    builder.add(
        "field_handler_error_validation_process",
        "验证过程出错: {error}",
        "字段验证过程抛出异常时的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "TypeError",
            }
        ],
    )
    builder.add(
        "field_handler_error_validation_summary",
        "字段验证失败",
        "字段验证失败摘要提示",
    )

    # utils/prompt-engine.js
    builder.add(
        "prompt_engine_custom_template_header",
        "{template}\n-------------------------------\n以下是本次输入的内容：{input}",
        "动态 Prompt 模板生成时的头部",
        placeholders=[
            {
                "name": "template",
                "description": "自定义 Prompt 模板",
                "example": "你是一名英语老师。",
            },
            {
                "name": "input",
                "description": "用户输入文本",
                "example": "test word",
            },
        ],
    )
    builder.add(
        "prompt_engine_requirements_body",
        "\n\n要求:\n- 输出有效JSON格式\n- 只能使用字段: {fields}\n- 可部分输出，但字段名必须准确",
        "动态 Prompt 要求说明",
        placeholders=[
            {
                "name": "fields",
                "description": "允许的字段列表",
                "example": "front, back",
            }
        ],
    )
    builder.add(
        "prompt_engine_default_header",
        "# Role: 专业单词查询助手\n\n请完成以下任务：\n1. 查询单词/短语: \"{{INPUT_TEXT}}\"\n2. 生成详细解析信息\n3. 按以下JSON格式输出：\n{{FIELD_SCHEMA}}\n\n要求：\n- 输出纯JSON格式，不包含任何解释文字\n- 根据单词/短语的特点，填充相应字段\n- 如果某个字段不适用，可以不输出该字段",
        "默认综合 Prompt 头部说明",
    )
    builder.add(
        "prompt_engine_field_prompt",
        "{field}相关内容",
        "生成字段说明时的模板",
        placeholders=[
            {
                "name": "field",
                "description": "字段名称",
                "example": "释义",
            }
        ],
    )
    builder.add(
        "prompt_engine_error_json_parse",
        "JSON 解析失败: {error}",
        "解析 Prompt 生成结果 JSON 失败时的提示",
        placeholders=[
            {
                "name": "error",
                "description": "错误详情",
                "example": "Unexpected token",
            }
        ],
    )

    # utils/storage.js
    builder.add(
        "storage_warning_missing_salt",
        "[storage] 未找到 {provider} 的加密盐，因此使用默认提供商。",
        "缺少加密盐时的日志提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "openai",
            }
        ],
    )
    builder.add(
        "storage_error_api_key_decrypt",
        "[storage] {provider} 的 API 密钥解密失败:",
        "解密 API Key 失败的日志提示前缀",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "anthropic",
            }
        ],
    )
    builder.add(
        "storage_error_api_key_decrypt_reset",
        "[storage] {provider} 的 API 密钥解密失败，已初始化为空字符串。",
        "解密 API Key 失败并回退为空字符串时的提示",
        placeholders=[
            {
                "name": "provider",
                "description": "提供商 ID",
                "example": "anthropic",
            }
        ],
    )
    builder.add(
        "storage_info_migrating_config",
        "检测到旧版设置，正在更新架构。",
        "检测到旧版配置时的提示",
    )
    builder.add(
        "storage_info_migration_done",
        "设置迁移完成。",
        "配置迁移完成提示",
    )
    builder.add(
        "storage_info_missing_config",
        "未找到已保存的设置，将返回默认值。",
        "未找到用户配置时的提示",
    )
    builder.add(
        "storage_error_loading_config",
        "加载设置时出错:",
        "读取配置失败的日志前缀",
    )


def main():
    builder = MessageBuilder()
    build_entries(builder)
    messages_by_locale = builder.build()

    locales_root = Path("_locales")
    for locale, messages in messages_by_locale.items():
        target_dir = locales_root / locale
        target_dir.mkdir(parents=True, exist_ok=True)
        with (target_dir / "messages.json").open("w", encoding="utf-8") as fp:
            json.dump(messages, fp, ensure_ascii=False, indent=2, sort_keys=True)


if __name__ == "__main__":
    main()
