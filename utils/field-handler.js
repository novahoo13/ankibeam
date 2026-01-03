// field-handler.js - 字段処理ロジック抽出モジュール
// 動的フィールドマッピングを提供

import { translate, createI18nError } from "./i18n.js";

const getText = (key, fallback, substitutions) =>
  translate(key, { fallback, substitutions });

/**
 * DOMからフィールド値を収集してAnkiに書き込む（エラーハンドリングと検証を含む拡張版）
 * @param {string[]} modelFields - モデルフィールド名の配列
 * @param {function} [wrapWithStyle] - オプションのスタイルラッピング関数
 * @param {Object} [options] - 追加設定（現在未使用、将来の拡張用）
 * @returns {object} - フィールド収集結果（fieldsオブジェクトと統計情報を含む）
 */
export function collectFieldsForWrite(modelFields, wrapWithStyle = null, options = {}) {
  try {
    let fields = {};
    const collectResult = {
      fields: {},
      mode: 'dynamic',
      totalFields: 0,
      collectedFields: 0,
      emptyFields: 0,
      missingElements: [],
      errors: []
    };

    // 動的モード：フィールド配列に基づいて収集
    if (!Array.isArray(modelFields)) {
      throw createI18nError('field_handler_error_model_fields_invalid', { fallback: 'modelFields必须是数组' });
    }

    collectResult.totalFields = modelFields.length;

    modelFields.forEach((fieldName, index) => {
      const elementId = `field-${index}`;
      const element = document.getElementById(elementId);

      if (!element) {
        const error = getText(
          "field_handler_error_field_element_missing",
          `找不到字段元素: ${elementId} (${fieldName})`,
          [elementId, fieldName]
        );
        collectResult.errors.push(error);
        collectResult.missingElements.push(fieldName);
        console.warn(error);
        fields[fieldName] = ''; // 空値を設定
        return;
      }

      const value = element.value || '';
      fields[fieldName] = value;

      if (value.trim()) {
        collectResult.collectedFields++;
      } else {
        collectResult.emptyFields++;
      }
    });

    // 应用样式包装
    if (wrapWithStyle && typeof wrapWithStyle === 'function') {
      try {
        Object.keys(fields).forEach(key => {
          const value = fields[key];
          if (value && value.trim()) {
            fields[key] = wrapWithStyle(value);
          }
        });
      } catch (wrapError) {
        const error = getText(
          "field_handler_error_wrap_style",
          `样式包装失败: ${wrapError.message}`,
          [wrapError.message]
        );
        collectResult.errors.push(error);
        console.error(error, wrapError);
      }
    }

    collectResult.fields = fields;

    // 记录收集日志
    console.log('[field-handler] フィールド収集完了:', {
      mode: collectResult.mode,
      totalFields: collectResult.totalFields,
      collectedFields: collectResult.collectedFields,
      emptyFields: collectResult.emptyFields,
      hasErrors: collectResult.errors.length > 0,
      fields: Object.keys(fields)
    });

    return collectResult;

  } catch (error) {
    console.error('[field-handler] フィールド収集失敗:', error);
    return {
      fields: {},
      mode: 'error',
      totalFields: 0,
      collectedFields: 0,
      emptyFields: 0,
      missingElements: [],
      errors: [error.message],
      error: true
    };
  }
}

/**
 * フィールド内容の有効性を検証（詳細な検証情報を含む拡張版）
 * @param {object} fields - フィールドマッピングオブジェクト
 * @param {boolean} _reserved - 予約パラメータ（後方互換性のため、未使用）
 * @param {object} [collectResult] - オプションの収集結果オブジェクト（より詳細な検証用）
 * @returns {object} - 詳細な検証結果
 */
export function validateFields(fields, _reserved = false, collectResult = null) {
  const validation = {
    isValid: false,
    message: '',
    errors: [],
    warnings: [],
    fieldStats: {
      totalFields: 0,
      filledFields: 0,
      emptyFields: 0,
      invalidFields: 0
    },
    details: {
      filledFieldNames: [],
      emptyFieldNames: [],
      invalidFieldNames: []
    }
  };

  try {
    // 基本パラメータ検証
    if (!fields || typeof fields !== "object") {
      validation.errors.push(
        getText(
          "field_handler_error_field_object_invalid",
          "字段对象为空或无效"
        )
      );
      validation.message = getText(
        "field_handler_error_field_data_invalid",
        "字段数据无效"
      );
      return validation;
    }

    const fieldNames = Object.keys(fields);
    validation.fieldStats.totalFields = fieldNames.length;

    if (fieldNames.length === 0) {
      validation.errors.push(
        getText("field_handler_error_no_fields_found", "没有找到任何字段")
      );
      validation.message = getText(
        "field_handler_error_field_list_empty",
        "字段列表为空"
      );
      return validation;
    }

    // 収集結果がある場合、収集プロセス中のエラーをチェック
    if (collectResult) {
      if (collectResult.errors && collectResult.errors.length > 0) {
        validation.errors.push(...collectResult.errors);
      }
      if (collectResult.missingElements && collectResult.missingElements.length > 0) {
        validation.warnings.push(
          getText(
            "field_handler_error_missing_dom_count",
            `缺失${collectResult.missingElements.length}个DOM元素`,
            [String(collectResult.missingElements.length)]
          )
        );
      }
    }

    // 各フィールドを分析
    fieldNames.forEach(fieldName => {
      const value = fields[fieldName];
      const trimmedValue = value ? value.trim() : '';

      if (trimmedValue) {
        validation.fieldStats.filledFields++;
        validation.details.filledFieldNames.push(fieldName);

        // 不正なフォーマットの可能性をチェック（HTMLタグが多すぎる場合など）
        if (trimmedValue.includes('<') && trimmedValue.includes('>')) {
          const htmlTagCount = (trimmedValue.match(/</g) || []).length;
          const textLength = trimmedValue.replace(/<[^>]*>/g, '').length;
          if (htmlTagCount > textLength / 10) {
            validation.warnings.push(
              getText(
                "field_handler_error_field_contains_html",
                `字段"${fieldName}"可能包含过多HTML标签`,
                [fieldName]
              )
            );
          }
        }

      } else {
        validation.fieldStats.emptyFields++;
        validation.details.emptyFieldNames.push(fieldName);
      }
    });

    // 動的モード検証：少なくとも1つのフィールドが必要
    if (validation.fieldStats.filledFields === 0) {
      validation.errors.push(
        getText('field_handler_error_min_field_content', '至少需要填写一个字段内容')
      );
    } else if (validation.fieldStats.filledFields < validation.fieldStats.totalFields / 2) {
      validation.warnings.push(
        getText(
          "field_handler_warning_few_fields",
          `填写字段较少 (${validation.fieldStats.filledFields}/${validation.fieldStats.totalFields})`,
          [
            String(validation.fieldStats.filledFields),
            String(validation.fieldStats.totalFields),
          ]
        )
      );
    }

    // 最終結果判定
    validation.isValid = validation.errors.length === 0;

    // メッセージ生成
    if (validation.isValid) {
      if (validation.warnings.length > 0) {
        validation.message = getText(
          "field_handler_warning_with_count",
          `验证通过，但有 ${validation.warnings.length} 个警告`,
          [String(validation.warnings.length)]
        );
      } else {
        validation.message = getText(
          "field_handler_warning_fields_filled",
          `验证通过，已填写 ${validation.fieldStats.filledFields} 个字段`,
          [String(validation.fieldStats.filledFields)]
        );
      }
    } else {
      validation.message = validation.errors[0]; // 最初のエラーを表示
    }

    return validation;

  } catch (error) {
    console.error('[field-handler] フィールド検証失敗:', error);
    validation.errors.push(
      getText(
        "field_handler_error_validation_process",
        `验证过程出错: ${error.message}`,
        [error.message]
      )
    );
    validation.message = getText(
      "field_handler_error_validation_summary",
      "字段验证失败"
    );
    return validation;
  }
}

