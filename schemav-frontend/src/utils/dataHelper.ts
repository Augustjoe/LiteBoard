/**
 * dataHelper.ts — 双模数据清洗引擎（Node 6 核心）
 *
 * 提供 ETL 工具函数，将探针抓取的原始 JSON 转换为标准化 DataAsset。
 * 使用 lodash-es 的 get 和 pick 进行安全访问与字段提取。
 *
 * 双模：
 * 1. 数组模式：目标路径的值是 Array，提取指定字段
 * 2. 对象翻转模式：目标路径的值是平铺 Object，翻转为 [{ name, value }]
 */

import { get, pick } from 'lodash-es'

/**
 * 判断一个值是否为“平铺对象”（内部无深层嵌套）
 * 即：所有一级属性的值都是基础类型（string | number | boolean | null）
 * 或值为 Array 但元素为基础类型
 */
function isFlatObject(val: unknown): boolean {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false
  const entries = Object.values(val as Record<string, unknown>)
  if (entries.length === 0) return false
  return entries.every((v) => {
    if (v === null || v === undefined) return true
    const t = typeof v
    if (t === 'string' || t === 'number' || t === 'boolean') return true
    // 允许值为基础类型数组
    if (Array.isArray(v) && v.every((item) => {
      const it = typeof item
      return it === 'string' || it === 'number' || it === 'boolean' || item === null
    })) return true
    return false
  })
}

/**
 * 判断一个值是否为“有效的叶子数据节点”
 * 有效的叶子节点：
 * - Array（数组模式）
 * - 平铺 Object（对象翻转模式）
 */
function isValidLeaf(val: unknown): boolean {
  if (Array.isArray(val)) return true
  return isFlatObject(val)
}

/**
 * findValidPaths(jsonObj)
 *
 * 递归扫描 JSON 对象，返回所有可进行数据萃取的路径字符串数组。
 * - 根节点用 '$root' 表示
 * - 路径格式如：'$root'、'$root.data'、'$root.data.list'、'$root.result.records'
 * - 仅返回值为 Array 或平铺 Object 的路径
 *
 * @param jsonObj - 待扫描的 JSON 值
 * @returns 有效数据路径字符串数组
 */
export function findValidPaths(jsonObj: unknown): string[] {
  const paths: string[] = []

  function walk(current: unknown, path: string): void {
    if (current === null || current === undefined) return

    // 如果当前节点是有效叶子，记录路径（不继续深入）
    if (isValidLeaf(current)) {
      paths.push(path)
      // 对于 Array，如果元素是对象，不继续展开（整个 Array 作为一个叶子节点返回）
      // 对于平铺 Object，也不继续展开
      return
    }

    if (typeof current === 'object') {
      if (Array.isArray(current)) {
        // 数组但元素不是基础类型数组（因为 isValidLeaf 为 false）
        // 尝试看第一个元素是否是对象，如果是则深入
        if (current.length > 0 && typeof current[0] === 'object' && current[0] !== null && !Array.isArray(current[0])) {
          // 深入第一个元素探索子路径
          walk(current[0], `${path}[0]`)
        }
      } else {
        // 普通对象：递归子属性
        const obj = current as Record<string, unknown>
        for (const key of Object.keys(obj)) {
          const childPath = path === '$root' ? `$root.${key}` : `${path}.${key}`
          walk(obj[key], childPath)
        }
      }
    }
    // 基础类型忽略
  }

  walk(jsonObj, '$root')
  return paths
}

/**
 * extractCleanData(rawJson, path, selectedKeys)
 *
 * 从原始 JSON 中，按指定路径和选中的 Key 提取清洗后的标准数据数组。
 *
 * 双模逻辑：
 *
 * 1. 数组模式（目标路径的值是 Array）：
 *    - 遍历数组每一项，用 lodash pick 提取 selectedKeys 指定的字段
 *    - 返回标准对象数组 [{ field1: val, field2: val }, ...]
 *
 * 2. 对象翻转模式（目标路径的值是平铺 Object）：
 *    - 将 { key1: val1, key2: val2 } 翻转为
 *      [{ name: 'key1', value: val1 }, { name: 'key2', value: val2 }]
 *    - 仅翻转 selectedKeys 中勾选的 key
 *    - 适用于 ECharts 饼图/柱状图标准结构
 *
 * @param rawJson - 原始探针数据
 * @param path - findValidPaths 返回的有效路径（如 '$root.data.list'）
 * @param selectedKeys - 用户勾选的字段/Key 列表
 * @returns 清洗后的标准化数据数组
 */
export function extractCleanData(
  rawJson: unknown,
  path: string,
  selectedKeys: string[],
): Record<string, unknown>[] {
  // 使用 lodash get 安全获取目标路径的值
  const target = get(rawJson, path === '$root' ? '' : path.replace(/^\$root\.?/, ''))

  if (target === null || target === undefined) {
    console.warn(`[dataHelper] extractCleanData: 路径 "${path}" 对应的值为 null/undefined`)
    return []
  }

  if (Array.isArray(target)) {
    // ========== 数组模式 ==========
    return (target as unknown[]).map((item) => {
      if (typeof item === 'object' && item !== null) {
        // lodash pick：仅提取 selectedKeys 中指定的字段
        return pick(item as Record<string, unknown>, selectedKeys) as Record<string, unknown>
      }
      // 数组元素为基础类型时，直接包装
      return { value: item } as Record<string, unknown>
    })
  }

  if (typeof target === 'object') {
    // ========== 对象翻转模式 ==========
    const obj = target as Record<string, unknown>
    const result: Record<string, unknown>[] = []

    for (const key of selectedKeys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        result.push({
          name: key,
          value: obj[key],
        })
      }
    }

    return result
  }

  console.warn(`[dataHelper] extractCleanData: 路径 "${path}" 的值类型不支持（${typeof target}）`)
  return []
}

/**
 * 从数据数组中提取所有字段名（去重）
 */
export function extractFields(data: Record<string, unknown>[]): string[] {
  const fieldSet = new Set<string>()
  for (const item of data) {
    Object.keys(item).forEach((k) => fieldSet.add(k))
  }
  return Array.from(fieldSet)
}
