import { defineComponent, ref, computed, watch } from 'vue'
import { get } from 'lodash-es'
import { useEditorStore } from '../stores/editorStore'
import { findValidPaths, extractCleanData, extractFields } from '../utils/dataHelper'
import './DataProbe.css'

/**
 * DataProbe — 超级探针面板（Node 6 重构）
 *
 * 两步走向导模式：
 *   第一步：请求数据 → 拿到 probeResult（不自动创建图表）
 *   第二步：数据萃取 → 选择路径 + 勾选字段 + 命名资产 → 保存为数据资产
 *
 * 底部：展示已入库的 assets 列表，可点击选中组件
 */
export default defineComponent({
  name: 'DataProbe',
  setup() {
    const store = useEditorStore()

    // ==================== 第一步：请求探针 ====================
    const targetUrl = ref('http://localhost:3000/api/mock-chart-data')
    const method = ref('GET')
    const probeResult = ref<unknown>(null)
    const loading = ref(false)
    const error = ref<string | null>(null)

    const sendProbe = async () => {
      loading.value = true
      error.value = null
      probeResult.value = null
      // 重置第二步状态
      selectedPath.value = ''
      selectedKeys.value = []
      assetName.value = ''
      pathIsObject.value = false

      try {
        const response = await fetch('http://localhost:3000/api/probe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetUrl: targetUrl.value,
            method: method.value,
          }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || `HTTP error! Status: ${response.status}`)
        }

        const data = await response.json()
        probeResult.value = data
      } catch (err) {
        error.value = err instanceof Error ? err.message : String(err)
        console.error('Error sending probe:', err)
      } finally {
        loading.value = false
      }
    }

    // ==================== 第二步：数据萃取 ====================

    /** findValidPaths 返回的可用路径列表 */
    const validPaths = computed<string[]>(() => {
      if (!probeResult.value) return []
      return findValidPaths(probeResult.value)
    })

    /** 用户选中的数据根节点路径 */
    const selectedPath = ref('')

    /** 选中路径对应的目标值类型是否为 Object（翻转模式） */
    const pathIsObject = ref(false)

    /** 选中路径下的所有 Key（用于 checkbox） */
    const availableKeys = ref<string[]>([])

    /** 用户勾选的 Key 列表 */
    const selectedKeys = ref<string[]>([])

    /** 资产名称 */
    const assetName = ref('')

    /** 数据来源类型提示（数组 or 对象） */
    const dataTypeHint = computed(() => {
      if (!probeResult.value || !selectedPath.value) return ''
      const target = get(
        probeResult.value,
        selectedPath.value === '$root' ? '' : selectedPath.value.replace(/^\$root\.?/, '')
      )
      if (Array.isArray(target)) return '数组模式：将提取每个元素中勾选的字段'
      if (typeof target === 'object' && target !== null) return '此对象将自动翻转为 name/value 标准数组'
      return ''
    })

    /** 当用户选择路径变化时，重新计算 availableKeys */
    const onPathChange = (val: string | number | boolean) => {
      const pathStr = String(val)
      selectedPath.value = pathStr
      selectedKeys.value = []
      availableKeys.value = []

      if (!probeResult.value || !pathStr) return

      const target = get(
        probeResult.value,
        pathStr === '$root' ? '' : pathStr.replace(/^\$root\.?/, '')
      )

      if (target === null || target === undefined) {
        pathIsObject.value = false
        return
      }

      if (Array.isArray(target)) {
        pathIsObject.value = false
        // 从数组所有元素中提取 key 的并集
        const keySet = new Set<string>()
        ;(target as unknown[]).forEach((item) => {
          if (typeof item === 'object' && item !== null) {
            Object.keys(item as Record<string, unknown>).forEach((k) => keySet.add(k))
          }
        })
        availableKeys.value = Array.from(keySet)
      } else if (typeof target === 'object') {
        pathIsObject.value = true
        availableKeys.value = Object.keys(target as Record<string, unknown>)
      }
    }

    /** 保存为数据资产 */
    const onSaveAsset = () => {
      if (!probeResult.value || !selectedPath.value) {
        error.value = '请先选择数据根节点'
        return
      }

      if (selectedKeys.value.length === 0) {
        error.value = '请至少勾选一个字段'
        return
      }

      const name = assetName.value.trim() || `数据集_${store.assets.length + 1}`

      // 调用清洗引擎
      const cleanData = extractCleanData(probeResult.value, selectedPath.value, selectedKeys.value)

      if (cleanData.length === 0) {
        error.value = '清洗后数据为空，请检查路径和字段选择'
        return
      }

      const fields = extractFields(cleanData)

      // 入库
      store.addAsset({
        id: `asset-${Date.now()}`,
        name,
        fields,
        data: cleanData,
      })

      // 重置萃取状态
      selectedPath.value = ''
      selectedKeys.value = []
      assetName.value = ''
      availableKeys.value = []
      pathIsObject.value = false
      error.value = null

      console.log(`[DataProbe] 数据资产 "${name}" 已入库，共 ${cleanData.length} 条记录`)
    }

    /** 删除资产 */
    const onRemoveAsset = (assetId: string) => {
      store.removeAsset(assetId)
    }

    return () => (
      <div class="data-probe-panel">
        <h3>🔍 超级探针</h3>

        {/* ==================== 第一步：请求数据 ==================== */}
        <div style={{
          marginBottom: '16px',
          padding: '12px',
          background: '#f5f7fa',
          borderRadius: '6px',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#303133', marginBottom: '8px' }}>
            📡 第一步：请求数据
          </div>
          <div class="input-group">
            <input
              value={targetUrl.value}
              onInput={(e: Event) => { targetUrl.value = (e.target as HTMLInputElement).value }}
              placeholder="输入目标 URL (e.g., https://api.example.com/data)"
            />
            <select
              value={method.value}
              onChange={(e: Event) => { method.value = (e.target as HTMLSelectElement).value }}
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
            <button onClick={sendProbe} disabled={loading.value}>
              {loading.value ? '请求中...' : '发送探针'}
            </button>
          </div>
          {loading.value && <div class="loading">加载中...</div>}
          {error.value && <div class="error">错误: {error.value}</div>}
        </div>

        {/* ==================== 第二步：数据萃取（仅探针成功后显示） ==================== */}
        {probeResult.value && (
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: '#f0f9eb',
            borderRadius: '6px',
            border: '1px solid #e1f3d8',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#67c23a', marginBottom: '8px' }}>
              🧹 第二步：数据萃取
            </div>

            {/* 选择数据根节点 */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#606266', marginBottom: '4px' }}>
                选择数据根节点：
              </div>
              <el-select
                model-value={selectedPath.value}
                onUpdate:model-value={onPathChange}
                placeholder="请选择数据根节点"
                style={{ width: '100%' }}
                clearable
              >
                {validPaths.value.map((p) => (
                  <el-option key={p} label={p} value={p} />
                ))}
              </el-select>
            </div>

            {/* 选中路径后的字段勾选 */}
            {selectedPath.value && availableKeys.value.length > 0 && (
              <>
                {/* 数据类型提示 */}
                <el-alert
                  title={dataTypeHint.value}
                  type={pathIsObject.value ? 'warning' : 'info'}
                  closable={false}
                  show-icon
                  style={{ marginBottom: '12px' }}
                />

                {/* 字段勾选 */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#606266', marginBottom: '4px' }}>
                    勾选需要提取的字段 ({selectedKeys.value.length}/{availableKeys.value.length})：
                  </div>
                  <el-checkbox-group
                    model-value={selectedKeys.value}
                    onUpdate:model-value={(vals: string[]) => { selectedKeys.value = vals }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {availableKeys.value.map((key) => (
                        <el-checkbox key={key} label={key} value={key}>
                          {key}
                        </el-checkbox>
                      ))}
                    </div>
                  </el-checkbox-group>
                </div>

                {/* 资产名称 */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '12px', color: '#606266', marginBottom: '4px' }}>
                    资产名称：
                  </div>
                  <el-input
                    model-value={assetName.value}
                    onUpdate:model-value={(val: string) => { assetName.value = val }}
                    placeholder={`数据集_${store.assets.length + 1}`}
                    style={{ width: '100%' }}
                    clearable
                  />
                </div>

                {/* 保存按钮 */}
                <el-button
                  type="success"
                  icon="FolderAdd"
                  style={{ width: '100%' }}
                  onClick={onSaveAsset}
                  disabled={selectedKeys.value.length === 0}
                >
                  保存为数据资产
                </el-button>
              </>
            )}
          </div>
        )}

        {/* ==================== 探针原始结果预览（可折叠） ==================== */}
        {probeResult.value && (
          <el-collapse style={{ marginBottom: '16px' }}>
            <el-collapse-item title="📋 探针原始结果 (JSON)" name="raw">
              <pre style={{
                background: '#f4f4f4',
                padding: '12px',
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '300px',
                overflowY: 'auto',
                fontSize: '11px',
                margin: 0,
              }}>
                {JSON.stringify(probeResult.value, null, 2)}
              </pre>
            </el-collapse-item>
          </el-collapse>
        )}

        {/* ==================== 底部：已入库资产列表 ==================== */}
        {store.assets.length > 0 && (
          <div class="result-panel" style={{ borderTop: '1px solid #ebeef5', paddingTop: '12px' }}>
            <h4>📦 数据资产库 ({store.assets.length})</h4>
            {store.assets.map((asset) => (
              <div
                key={asset.id}
                style={{
                  padding: '8px 10px',
                  marginBottom: '6px',
                  background: '#f5f7fa',
                  borderRadius: '4px',
                  border: '1px solid #ebeef5',
                  fontSize: '12px',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div>
                    <strong style={{ color: '#409eff' }}>{asset.name}</strong>
                    <span style={{ color: '#909399', marginLeft: '6px' }}>
                      ({asset.data.length} 条, {asset.fields.length} 字段)
                    </span>
                  </div>
                  <el-button
                    type="danger"
                    size="small"
                    icon="Delete"
                    plain
                    onClick={() => onRemoveAsset(asset.id)}
                    style={{ padding: '2px 6px', fontSize: '11px' }}
                  >
                    删除
                  </el-button>
                </div>
                <div style={{ color: '#c0c4cc', marginTop: '2px' }}>
                  字段: {asset.fields.join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ==================== 画布组件列表 ==================== */}
        {store.components.length > 0 && (
          <div class="result-panel" style={{ marginTop: '12px', borderTop: '1px solid #ebeef5', paddingTop: '12px' }}>
            <h4>📐 画布组件 ({store.components.length})</h4>
            <ul>
              {store.components.map((comp) => (
                <li
                  key={comp.id}
                  style={{
                    cursor: 'pointer',
                    fontWeight: store.selectedComponentId === comp.id ? 'bold' : 'normal',
                    color: store.selectedComponentId === comp.id ? '#409eff' : '#606266',
                  }}
                  onClick={() => store.selectComponent(comp.id)}
                >
                  {comp.type} — {comp.id}
                </li>
              ))}
            </ul>
            {store.selectedComponent && (
              <div style={{ fontSize: '11px', color: '#909399', marginTop: '4px' }}>
                选中: {store.selectedComponent.id} @
                (x:{store.selectedComponent.position.x},
                y:{store.selectedComponent.position.y},
                w:{store.selectedComponent.position.w},
                h:{store.selectedComponent.position.h})
              </div>
            )}
          </div>
        )}
      </div>
    )
  },
})
