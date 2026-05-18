import { defineComponent, ref, watch, type PropType } from 'vue'
import { useEditorStore, type DataAsset } from '../stores/editorStore'

/**
 * DataProbe — 双模超级探针弹窗（数据湖改造）
 *
 * 作为 el-dialog 弹窗形式嵌入 EditorView，分为两个页签：
 * 1. 📡 远程获取：URL + Method + Headers + Body → 通过 Node 中转层 /api/probe 代理请求
 * 2. ✍️ 手动添加：粘贴 JSON → JSON.parse 校验后入库
 *
 * 统一入库：用户输入【资产名称】→ 将原始数据原封不动作为 data 包装成 DataAsset
 */
export default defineComponent({
  name: 'DataProbe',
  props: {
    /** 弹窗是否可见 */
    visible: {
      type: Boolean,
      required: true,
    },
    /** 关闭弹窗回调 */
    onClose: {
      type: Function as PropType<() => void>,
      required: true,
    },
    /** 保存资产成功后的回调（传递新建的 DataAsset） */
    onSaved: {
      type: Function as PropType<(asset: DataAsset) => void>,
      required: true,
    },
  },
  setup(props) {
    const store = useEditorStore()
    const activeTab = ref('remote')

    // ==================== 📡 远程获取 状态 ====================
    const targetUrl = ref('http://localhost:3000/api/mock-chart-data')
    const method = ref<'GET' | 'POST'>('GET')
    const headerPairs = ref<{ key: string; value: string }[]>([])
    const requestBody = ref('')
    const remoteLoading = ref(false)
    const remoteError = ref<string | null>(null)
    const remoteResult = ref<unknown>(null)

    // ==================== ✍️ 手动添加 状态 ====================
    const manualJson = ref('')
    const manualError = ref<string | null>(null)

    // ==================== 共同：资产名称 ====================
    const assetName = ref('')

    /** 添加一行 Header Key-Value */
    const addHeader = () => {
      headerPairs.value.push({ key: '', value: '' })
    }

    /** 删除指定 Header 行 */
    const removeHeader = (index: number) => {
      headerPairs.value.splice(index, 1)
    }

    /** 发送远程探针 */
    const sendRemoteProbe = async () => {
      remoteLoading.value = true
      remoteError.value = null
      remoteResult.value = null

      try {
        // 组装 headers
        const headers: Record<string, string> = {}
        for (const pair of headerPairs.value) {
          const k = pair.key.trim()
          if (k) {
            headers[k] = pair.value
          }
        }

        const payload: Record<string, unknown> = {
          targetUrl: targetUrl.value,
          method: method.value,
        }
        if (Object.keys(headers).length > 0) {
          payload.headers = headers
        }
        if (method.value === 'POST' && requestBody.value.trim()) {
          payload.body = requestBody.value.trim()
        }

        const response = await fetch('http://localhost:3000/api/probe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || `HTTP error! Status: ${response.status}`)
        }

        const data = await response.json()
        remoteResult.value = data
      } catch (err) {
        remoteError.value = err instanceof Error ? err.message : String(err)
        console.error('[DataProbe] 远程探针请求失败:', err)
      } finally {
        remoteLoading.value = false
      }
    }

    /** 保存资产（统一入库入口） */
    const onSaveAsset = (rawData: unknown) => {
      const name = assetName.value.trim() || `数据资产_${store.assets.length + 1}`

      // 提取 fields：如果 rawData 是数组且元素为对象，合并所有 key
      let fields: string[] = []
      if (Array.isArray(rawData)) {
        const keySet = new Set<string>()
        ;(rawData as unknown[]).forEach((item) => {
          if (typeof item === 'object' && item !== null) {
            Object.keys(item as Record<string, unknown>).forEach((k) => keySet.add(k))
          }
        })
        fields = Array.from(keySet)
      } else if (typeof rawData === 'object' && rawData !== null) {
        fields = Object.keys(rawData as Record<string, unknown>)
      }

      const assetId = `asset-${Date.now()}`

      props.onSaved({
        id: assetId,
        name,
        fields,
        data: rawData,
      })

      console.log(`[DataProbe] 数据资产 "${name}" 已入库`)
    }

    /** 手动模式：JSON.parse 校验 + 保存 */
    const onSaveManual = () => {
      manualError.value = null

      if (!manualJson.value.trim()) {
        manualError.value = '请粘贴 JSON 数据'
        return
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(manualJson.value)
      } catch (err) {
        manualError.value = 'JSON 格式错误: ' + (err instanceof Error ? err.message : String(err))
        return
      }

      if (parsed === null || parsed === undefined) {
        manualError.value = '数据为空 (null/undefined)'
        return
      }

      onSaveAsset(parsed)
    }

    /** 远程模式：从探针结果保存 */
    const onSaveRemote = () => {
      remoteError.value = null

      if (!remoteResult.value) {
        remoteError.value = '请先成功获取远程数据'
        return
      }

      onSaveAsset(remoteResult.value)
    }

    // ==================== 弹窗关闭时重置状态 ====================
    watch(
      () => props.visible,
      (isVisible) => {
        if (isVisible) {
          // 打开时重置
          activeTab.value = 'remote'
          targetUrl.value = 'http://localhost:3000/api/mock-chart-data'
          method.value = 'GET'
          headerPairs.value = []
          requestBody.value = ''
          remoteLoading.value = false
          remoteError.value = null
          remoteResult.value = null
          manualJson.value = ''
          manualError.value = null
          assetName.value = ''
        }
      },
    )

    return () => (
      <el-dialog
        model-value={props.visible}
        onUpdate:model-value={(val: boolean) => { if (!val) props.onClose() }}
        title="🔍 添加数据资产"
        width="680px"
        top="8vh"
        destroy-on-close
        close-on-click-modal={false}
      >
        <el-tabs model-value={activeTab.value} onUpdate:model-value={(v: string) => { activeTab.value = v }}>
          {/* ==================== 页签 1：📡 远程获取 ==================== */}
          <el-tab-pane label="📡 远程获取" name="remote">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* URL + Method */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <el-select
                  model-value={method.value}
                  onUpdate:model-value={(v: 'GET' | 'POST') => { method.value = v }}
                  style={{ width: '110px' }}
                >
                  <el-option label="GET" value="GET" />
                  <el-option label="POST" value="POST" />
                </el-select>
                <el-input
                  model-value={targetUrl.value}
                  onUpdate:model-value={(v: string) => { targetUrl.value = v }}
                  placeholder="输入目标 URL"
                  style={{ flex: 1 }}
                />
              </div>

              {/* Headers 设置区 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#606266' }}>📋 Headers</span>
                  <el-button size="small" icon="Plus" onClick={addHeader} text type="primary">
                    添加 Header
                  </el-button>
                </div>
                {headerPairs.value.map((pair, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                    <el-input
                      model-value={pair.key}
                      onUpdate:model-value={(v: string) => { headerPairs.value[idx] = { ...pair, key: v } }}
                      placeholder="Key"
                      style={{ flex: '1 1 40%' }}
                    />
                    <el-input
                      model-value={pair.value}
                      onUpdate:model-value={(v: string) => { headerPairs.value[idx] = { ...pair, value: v } }}
                      placeholder="Value"
                      style={{ flex: '1 1 60%' }}
                    />
                    <el-button
                      icon="Delete"
                      circle
                      size="small"
                      onClick={() => removeHeader(idx)}
                    />
                  </div>
                ))}
                {headerPairs.value.length === 0 && (
                  <div style={{ fontSize: '12px', color: '#c0c4cc' }}>
                    未设置自定义 Header（默认会带 Accept: application/json）
                  </div>
                )}
              </div>

              {/* Body 设置区（仅 POST 时显示） */}
              {method.value === 'POST' && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#606266', marginBottom: '6px' }}>
                    📝 Body (JSON)
                  </div>
                  <el-input
                    model-value={requestBody.value}
                    onUpdate:model-value={(v: string) => { requestBody.value = v }}
                    type="textarea"
                    rows={4}
                    placeholder='{"key": "value"}'
                  />
                </div>
              )}

              {/* 发送按钮 */}
              <el-button
                type="primary"
                icon="Promotion"
                onClick={sendRemoteProbe}
                loading={remoteLoading.value}
                disabled={!targetUrl.value.trim()}
                style={{ alignSelf: 'flex-start' }}
              >
                {remoteLoading.value ? '请求中...' : '发送探针'}
              </el-button>

              {/* 错误提示 */}
              {remoteError.value && (
                <el-alert title={remoteError.value} type="error" closable={false} show-icon />
              )}

              {/* 探针结果预览 */}
              {remoteResult.value && (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#67c23a', marginBottom: '6px' }}>
                    ✅ 数据获取成功
                  </div>
                  <pre style={{
                    background: '#f4f4f4',
                    padding: '12px',
                    borderRadius: '6px',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: '220px',
                    overflowY: 'auto',
                    fontSize: '11px',
                    margin: 0,
                    border: '1px solid #e1f3d8',
                  }}>
                    {JSON.stringify(remoteResult.value, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </el-tab-pane>

          {/* ==================== 页签 2：✍️ 手动添加 ==================== */}
          <el-tab-pane label="✍️ 手动添加" name="manual">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#606266', marginBottom: '6px' }}>
                  粘贴 JSON 数据
                </div>
                <el-input
                  model-value={manualJson.value}
                  onUpdate:model-value={(v: string) => { manualJson.value = v }}
                  type="textarea"
                  rows={8}
                  placeholder='粘贴你的 JSON 数据，例如：[{"name": "A", "value": 100}] 或 {"key1": 10, "key2": 20}'
                />
              </div>

              {manualError.value && (
                <el-alert title={manualError.value} type="error" closable={false} show-icon />
              )}
            </div>
          </el-tab-pane>
        </el-tabs>

        {/* ==================== 底部：资产名称 + 保存按钮 ==================== */}
        <div style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #ebeef5',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#303133', whiteSpace: 'nowrap' }}>
              🏷️ 资产名称
            </span>
            <el-input
              model-value={assetName.value}
              onUpdate:model-value={(v: string) => { assetName.value = v }}
              placeholder={`数据资产_${store.assets.length + 1}`}
              style={{ flex: 1 }}
              clearable
            />
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <el-button onClick={props.onClose}>取消</el-button>
            {activeTab.value === 'manual' ? (
              <el-button
                type="primary"
                icon="FolderAdd"
                onClick={onSaveManual}
                disabled={!manualJson.value.trim()}
              >
                保存为数据资产
              </el-button>
            ) : (
              <el-button
                type="primary"
                icon="FolderAdd"
                onClick={onSaveRemote}
                disabled={!remoteResult.value}
              >
                保存为数据资产
              </el-button>
            )}
          </div>
        </div>
      </el-dialog>
    )
  },
})
