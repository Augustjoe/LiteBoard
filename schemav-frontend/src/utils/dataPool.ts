import type { DataPool } from '../stores/editorStore'

export type DataPoolValidation =
  | { ok: true; data: DataPool; warning: string | null }
  | { ok: false; message: string }

export function validateDataPoolResult(result: unknown): DataPoolValidation {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    const typeLabel = Array.isArray(result) ? 'Array' : (result === null ? 'null' : typeof result)
    return { ok: false, message: `返回结果必须是普通对象，不能是 ${typeLabel}` }
  }

  const entries = Object.entries(result as Record<string, unknown>)
  if (entries.length === 0) {
    return { ok: false, message: '返回结果不能为空对象，至少需要一个字段数组' }
  }

  for (const [field, value] of entries) {
    if (!Array.isArray(value)) {
      return { ok: false, message: `字段 "${field}" 的值必须是数组` }
    }
  }

  const lengths = entries.map(([, value]) => (value as unknown[]).length)
  const uniqueLengths = Array.from(new Set(lengths))
  const warning = uniqueLengths.length > 1
    ? `字段数组长度不一致：${entries.map(([field, value]) => `${field}=${(value as unknown[]).length}`).join(', ')}`
    : null

  return { ok: true, data: Object.fromEntries(entries) as DataPool, warning }
}

export function getOverwriteFields(existing: DataPool | null, incoming: DataPool): string[] {
  if (!existing) return []
  const existingFields = new Set(Object.keys(existing))
  return Object.keys(incoming).filter((field) => existingFields.has(field))
}
