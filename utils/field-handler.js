// field-handler.js - 字段处理逻辑抽取模块
// 提供动态字段映射和向后兼容性处理

/**
 * 判断是否使用传统模式（两字段以下）
 * @param {object} config - 配置对象
 * @returns {boolean} - 是否为传统模式
 */
export function isLegacyMode(config) {
  return !config?.ankiConfig?.modelFields?.length || config.ankiConfig.modelFields.length <= 2;
}

/**
 * 获取传统模式的字段映射
 * @returns {object} - 传统字段ID映射
 */
export function getLegacyFieldMapping() {
  return { front: 'front-input', back: 'back-input' };
}

/**
 * 获取动态字段映射
 * @param {string[]} modelFields - 模型字段名数组
 * @returns {object} - 字段名到元素ID的映射
 */
export function getDynamicFieldMapping(modelFields) {
  return modelFields.reduce((mapping, field, index) => {
    mapping[field] = `field-${index}`;
    return mapping;
  }, {});
}

/**
 * 根据字段名判断合适的输入类型
 * @param {string} fieldName - 字段名
 * @returns {object} - 包含type和其他属性的对象
 */
export function getInputTypeForField(fieldName) {
  const name = fieldName.toLowerCase();

  // 简单的启发式规则判断字段类型
  if (name.includes('example') || name.includes('sentence') ||
      name.includes('meaning') || name.includes('definition') ||
      name.includes('explanation') || name.includes('note') ||
      name.includes('back') || name.includes('背面')) {
    return { type: 'textarea', rows: 3 };
  } else {
    return { type: 'input' };
  }
}

/**
 * 从DOM中收集字段值用于写入Anki (增强版本，包含错误处理和验证)
 * @param {string[]} modelFields - 模型字段名数组，为空或长度<=2时使用legacy模式
 * @param {function} [wrapWithStyle] - 可选的样式包装函数
 * @returns {object} - 字段收集结果，包含fields对象和统计信息
 */
export function collectFieldsForWrite(modelFields, wrapWithStyle = null) {
  try {
    let fields = {};
    const collectResult = {
      fields: {},
      mode: null,
      totalFields: 0,
      collectedFields: 0,
      emptyFields: 0,
      missingElements: [],
      errors: []
    };

    const isLegacy = isLegacyMode({ ankiConfig: { modelFields } });
    collectResult.mode = isLegacy ? 'legacy' : 'dynamic';

    if (isLegacy) {
      // Legacy模式：使用固定的front/back字段
      collectResult.totalFields = 2;

      const frontElement = document.getElementById('front-input');
      const backElement = document.getElementById('back-input');

      if (!frontElement) {
        collectResult.errors.push('找不到front-input元素');
        collectResult.missingElements.push('front-input');
      }
      if (!backElement) {
        collectResult.errors.push('找不到back-input元素');
        collectResult.missingElements.push('back-input');
      }

      const front = frontElement?.value || '';
      const back = backElement?.value || '';

      // 获取实际的字段名（可能来自配置）
      const frontFieldName = (modelFields && modelFields[0]) || 'Front';
      const backFieldName = (modelFields && modelFields[1]) || 'Back';

      fields[frontFieldName] = front;
      fields[backFieldName] = back;

      collectResult.collectedFields = (front.trim() ? 1 : 0) + (back.trim() ? 1 : 0);
      collectResult.emptyFields = 2 - collectResult.collectedFields;

    } else {
      // Dynamic模式：根据字段数组收集
      if (!Array.isArray(modelFields)) {
        throw new Error('modelFields必须是数组');
      }

      collectResult.totalFields = modelFields.length;

      modelFields.forEach((fieldName, index) => {
        const elementId = `field-${index}`;
        const element = document.getElementById(elementId);

        if (!element) {
          const error = `找不到字段元素: ${elementId} (${fieldName})`;
          collectResult.errors.push(error);
          collectResult.missingElements.push(fieldName);
          console.warn(error);
          fields[fieldName] = ''; // 设置为空值
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
    }

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
        const error = `样式包装失败: ${wrapError.message}`;
        collectResult.errors.push(error);
        console.error(error, wrapError);
      }
    }

    collectResult.fields = fields;

    // 记录收集日志
    console.log('字段收集完成:', {
      mode: collectResult.mode,
      totalFields: collectResult.totalFields,
      collectedFields: collectResult.collectedFields,
      emptyFields: collectResult.emptyFields,
      hasErrors: collectResult.errors.length > 0,
      fields: Object.keys(fields)
    });

    return collectResult;

  } catch (error) {
    console.error('字段收集失败:', error);
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
 * 验证字段内容是否有效 (增强版本，包含详细验证信息)
 * @param {object} fields - 字段映射对象
 * @param {boolean} isLegacy - 是否为传统模式
 * @param {object} [collectResult] - 可选的收集结果对象，用于更详细的验证
 * @returns {object} - 详细验证结果
 */
export function validateFields(fields, isLegacy = false, collectResult = null) {
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
    // 基本参数验证
    if (!fields || typeof fields !== 'object') {
      validation.errors.push('字段对象为空或无效');
      validation.message = '字段数据无效';
      return validation;
    }

    const fieldNames = Object.keys(fields);
    validation.fieldStats.totalFields = fieldNames.length;

    if (fieldNames.length === 0) {
      validation.errors.push('没有找到任何字段');
      validation.message = '字段列表为空';
      return validation;
    }

    // 如果有收集结果，检查收集过程中的错误
    if (collectResult) {
      if (collectResult.errors && collectResult.errors.length > 0) {
        validation.errors.push(...collectResult.errors);
      }
      if (collectResult.missingElements && collectResult.missingElements.length > 0) {
        validation.warnings.push(`缺失${collectResult.missingElements.length}个DOM元素`);
      }
    }

    // 分析每个字段
    fieldNames.forEach(fieldName => {
      const value = fields[fieldName];
      const trimmedValue = value ? value.trim() : '';

      if (trimmedValue) {
        validation.fieldStats.filledFields++;
        validation.details.filledFieldNames.push(fieldName);

        // 检查内容质量
        if (trimmedValue.length < 2) {
          validation.warnings.push(`字段"${fieldName}"内容过短: "${trimmedValue}"`);
        }

        // 检查是否可能是错误格式（比如包含HTML标签但看起来不正常）
        if (trimmedValue.includes('<') && trimmedValue.includes('>')) {
          const htmlTagCount = (trimmedValue.match(/</g) || []).length;
          const textLength = trimmedValue.replace(/<[^>]*>/g, '').length;
          if (htmlTagCount > textLength / 10) {
            validation.warnings.push(`字段"${fieldName}"可能包含过多HTML标签`);
          }
        }

      } else {
        validation.fieldStats.emptyFields++;
        validation.details.emptyFieldNames.push(fieldName);
      }
    });

    // Legacy模式特殊验证
    if (isLegacy) {
      const frontKeys = fieldNames.filter(key =>
        key.toLowerCase().includes('front') || key === 'Front'
      );
      const backKeys = fieldNames.filter(key =>
        key.toLowerCase().includes('back') || key === 'Back'
      );

      if (frontKeys.length === 0 && backKeys.length === 0) {
        // 回退到检查第一和第二个字段
        if (fieldNames.length >= 2) {
          const firstField = fields[fieldNames[0]] || '';
          const secondField = fields[fieldNames[1]] || '';

          if (!firstField.trim() || !secondField.trim()) {
            validation.errors.push('Legacy模式下前两个字段都必须填写');
          }
        } else {
          validation.errors.push('Legacy模式需要至少两个字段');
        }
      } else {
        const frontValue = frontKeys.length > 0 ? (fields[frontKeys[0]] || '') : '';
        const backValue = backKeys.length > 0 ? (fields[backKeys[0]] || '') : '';

        if (!frontValue.trim()) {
          validation.errors.push('请填写正面内容');
        }
        if (!backValue.trim()) {
          validation.errors.push('请填写背面内容');
        }
      }
    } else {
      // Dynamic模式验证
      if (validation.fieldStats.filledFields === 0) {
        validation.errors.push('至少需要填写一个字段内容');
      } else if (validation.fieldStats.filledFields < validation.fieldStats.totalFields / 2) {
        validation.warnings.push(`填写字段较少 (${validation.fieldStats.filledFields}/${validation.fieldStats.totalFields})`);
      }
    }

    // 最终结果判断
    validation.isValid = validation.errors.length === 0;

    // 生成消息
    if (validation.isValid) {
      if (validation.warnings.length > 0) {
        validation.message = `验证通过，但有 ${validation.warnings.length} 个警告`;
      } else {
        validation.message = `验证通过，已填写 ${validation.fieldStats.filledFields} 个字段`;
      }
    } else {
      validation.message = validation.errors[0]; // 显示第一个错误
    }

    return validation;

  } catch (error) {
    console.error('字段验证失败:', error);
    validation.errors.push(`验证过程出错: ${error.message}`);
    validation.message = '字段验证失败';
    return validation;
  }
}