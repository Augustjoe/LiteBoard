import { defineComponent, ref, watch, type PropType, nextTick, computed } from 'vue'
import { useEditorStore, type DataPool } from '../stores/editorStore'
import { ElMessage } from 'element-plus'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import type { EditorView as CMEditorView } from '@codemirror/view'
import { getOverwriteFields, validateDataPoolResult, type DataPoolValidation } from '../utils/dataPool'

/**
 * DataProbe — 当前数据集导入弹窗（v2：上下分栏一站式）
 *
 * 设计理念：
 * - 取消分步，上下分栏布局
 * - 上半区：输入源（远程获取 / 手动粘贴，手动粘贴使用 vue-codemirror JSON）
 * - 下半区：数据预览与过滤（原始数据只读 + JS 过滤器）
 * - 执行成功后调用 store.mergeGlobalData() 增量合并到当前仪表盘数据集
 */

/** 默认 JS 过滤器代码 */
const DEFAULT_FILTER_CODE = `// res 是接口返回的原始数据。
// 请返回当前数据集对象：{ 字段名或数据集名: [...] }。
return res;`

export default defineComponent({
  name: 'DataProbe',
  props: {
    visible: {
      type: Boolean,
      required: true,
    },
    onClose: {
      type: Function as PropType<() => void>,
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

    // ==================== 原始数据（获取成功后暂存） ====================
    const rawData = ref<unknown>(null)
    const rawDataJson = computed(() => {
      if (rawData.value === null) return ''
      return JSON.stringify(rawData.value, null, 2)
    })

    // ==================== 🧹 JS 过滤器 状态 ====================
    const filterCode = ref(DEFAULT_FILTER_CODE)
    const filterError = ref<string | null>(null)
    const executing = ref(false)
    const showPreviewDialog = ref(false)
    const previewResultJson = ref('')
    const pendingImportData = ref<DataPool | null>(null)
    const pendingImportWarning = ref<string | null>(null)
    const pendingOverwriteFields = computed(() => (
      pendingImportData.value ? getOverwriteFields(store.globalData, pendingImportData.value) : []
    ))
    const showOverwriteDialog = ref(false)
    const overwriteFields = ref<string[]>([])
    let resolveOverwriteConfirm: ((confirmed: boolean) => void) | null = null

    // ==================== CodeMirror 视图引用（用于格式化） ====================
    let manualEditorView: CMEditorView | null = null

    /** CodeMirror ready 回调 — vue-codemirror 的 onReady 传递 { view, state, container } */
    const onManualReady = (payload: { view: CMEditorView; state: any; container: HTMLDivElement }) => {
      manualEditorView = payload.view
    }

    // ==================== CodeMirror 扩展 ====================
    const jsonExtension = json()
    const jsExtension = javascript()
    const themeExtension = oneDark

    /** 格式化手动输入的 JSON */
    const formatManualJson = () => {
      try {
        const parsed = JSON.parse(manualJson.value)
        manualJson.value = JSON.stringify(parsed, null, 2)
        manualError.value = null
      } catch (err) {
        manualError.value = 'JSON 格式错误，无法格式化: ' + (err instanceof Error ? err.message : String(err))
      }
    }

    // ==================== 添加/删除 Header ====================
    const addHeader = () => {
      headerPairs.value.push({ key: '', value: '' })
    }
    const removeHeader = (index: number) => {
      headerPairs.value.splice(index, 1)
    }

    const commitDataPool = async (data: DataPool, warning: string | null) => {
      const overwriteFields = getOverwriteFields(store.globalData, data)
      if (overwriteFields.length > 0) {
        const confirmed = await requestOverwriteConfirm(overwriteFields)
        if (!confirmed) throw new Error('overwrite_cancelled')
      }

      store.mergeGlobalData(data)
      if (warning) {
        ElMessage.warning(warning)
      } else if (overwriteFields.length > 0) {
        ElMessage.success(`数据已导入，已覆盖 ${overwriteFields.length} 个字段`)
      } else {
        ElMessage.success('数据已导入当前数据集')
      }
      props.onClose()
    }

    const requestOverwriteConfirm = (fields: string[]) => new Promise<boolean>((resolve) => {
      overwriteFields.value = fields
      showOverwriteDialog.value = true
      resolveOverwriteConfirm = resolve
    })

    const resolveOverwrite = (confirmed: boolean) => {
      showOverwriteDialog.value = false
      const resolve = resolveOverwriteConfirm
      resolveOverwriteConfirm = null
      resolve?.(confirmed)
    }

    const runFilter = (): DataPoolValidation => {
      if (rawData.value === null) {
        return { ok: false, message: '无可用的原始数据，请先获取或粘贴数据' }
      }

      try {
        const fn = new Function('res', filterCode.value)
        return validateDataPoolResult(fn(rawData.value))
      } catch (err) {
        return { ok: false, message: '代码执行异常: ' + (err instanceof Error ? err.message : String(err)) }
      }
    }

    const preparePreview = (validation: Extract<DataPoolValidation, { ok: true }>) => {
      pendingImportData.value = validation.data
      pendingImportWarning.value = validation.warning
      previewResultJson.value = JSON.stringify(validation.data, null, 2)
      showPreviewDialog.value = true
    }

    const importPreviewResult = async () => {
      if (!pendingImportData.value) return
      try {
        await commitDataPool(pendingImportData.value, pendingImportWarning.value)
        showPreviewDialog.value = false
      } catch {
        // 用户取消覆盖确认时保持预览弹窗打开，方便继续检查结果。
      }
    }

    // ==================== 发送远程探针 ====================
    const sendRemoteProbe = async () => {
      remoteLoading.value = true
      remoteError.value = null
      remoteResult.value = null
      rawData.value = null

      try {
        const headers: Record<string, string> = {}
        for (const pair of headerPairs.value) {
          const k = pair.key.trim()
          if (k) headers[k] = pair.value
        }

        const payload: Record<string, unknown> = {
          targetUrl: targetUrl.value,
          method: method.value,
        }
        if (Object.keys(headers).length > 0) payload.headers = headers
        if (method.value === 'POST' && requestBody.value.trim()) {
          payload.body = requestBody.value.trim()
        }

        const response = await fetch('http://localhost:3000/api/probe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || `HTTP error! Status: ${response.status}`)
        }

        const data = await response.json()
        remoteResult.value = data
        rawData.value = data
      } catch (err) {
        remoteError.value = err instanceof Error ? err.message : String(err)
        console.error('[DataProbe] 远程探针请求失败:', err)
      } finally {
        remoteLoading.value = false
      }
    }

    // ==================== 手动模式：校验 JSON 并直接合并至当前数据集 ====================
    const onParseAndMergeManual = async () => {
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

      const validation = validateDataPoolResult(parsed)
      if (!validation.ok) {
        manualError.value = validation.message
        return
      }

      // 校验通过，直接增量合并
      try {
        await commitDataPool(validation.data, validation.warning)
      } catch {
        // 用户取消覆盖确认。
      }
    }

    // ==================== 执行 JS 过滤器并合并到当前数据集 ====================
    const executeAndMerge = async () => {
      filterError.value = null
      executing.value = true

      try {
        // 延迟一下让 loading 状态可见
        await nextTick()

        const validation = runFilter()
        if (!validation.ok) {
          ElMessage.error(validation.message)
          filterError.value = validation.message
          return
        }

        try {
          await commitDataPool(validation.data, validation.warning)
        } catch {
          // 用户取消覆盖确认。
        }
      } finally {
        executing.value = false
      }
    }

    // ==================== 预览 JS 过滤器执行结果 ====================
    const onPreviewFilter = async () => {
      filterError.value = null
      const validation = runFilter()
      if (!validation.ok) {
        filterError.value = validation.message
        return
      }
      if (validation.warning) {
        filterError.value = validation.warning
      }
      preparePreview(validation)
    }

    // ==================== 弹窗打开时重置状态 ====================
    watch(
      () => props.visible,
      (isVisible) => {
        if (isVisible) {
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
          rawData.value = null
          filterCode.value = DEFAULT_FILTER_CODE
          filterError.value = null
          executing.value = false
          showPreviewDialog.value = false
          previewResultJson.value = ''
          pendingImportData.value = null
          pendingImportWarning.value = null
        }
      },
    )

    return () => (
      <el-dialog
        model-value={props.visible}
        onUpdate:model-value={(val: boolean) => { if (!val) props.onClose() }}
        title="🔍 创建/更新当前数据集"
        width="1040px"
        top="3vh"
        destroy-on-close
        close-on-click-modal={false}
        class="data-probe-dialog data-probe-dialog--v2"
      >
        <div class={['probe-layout', activeTab.value === 'manual' && 'probe-layout--manual']}>
          {/* ==================== 上半区：输入源 ==================== */}
          <div class="probe-section probe-section--input">
            <div class="probe-section__title">📥 输入源</div>
            <el-tabs
              model-value={activeTab.value}
              onUpdate:model-value={(v: string) => { activeTab.value = v }}
              class="probe-tabs"
            >
              {/* ---- 📡 远程获取 ---- */}
              <el-tab-pane label="📡 远程获取" name="remote">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {/* URL + Method */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <el-select
                      model-value={method.value}
                      onUpdate:model-value={(v: 'GET' | 'POST') => { method.value = v }}
                      style={{ width: '100px' }}
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

                  {/* Headers */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#606266' }}>📋 Headers</span>
                      <el-button size="small" icon="Plus" onClick={addHeader} text type="primary">
                        添加
                      </el-button>
                    </div>
                    {headerPairs.value.map((pair, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                        <el-input
                          model-value={pair.key}
                          onUpdate:model-value={(v: string) => { headerPairs.value[idx] = { ...pair, key: v } }}
                          placeholder="Key"
                          size="small"
                          style={{ flex: '1 1 35%' }}
                        />
                        <el-input
                          model-value={pair.value}
                          onUpdate:model-value={(v: string) => { headerPairs.value[idx] = { ...pair, value: v } }}
                          placeholder="Value"
                          size="small"
                          style={{ flex: '1 1 65%' }}
                        />
                        <el-button icon="Delete" circle size="small" onClick={() => removeHeader(idx)} />
                      </div>
                    ))}
                  </div>

                  {/* Body (POST only) */}
                  {method.value === 'POST' && (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#606266', marginBottom: '4px' }}>
                        📝 Body (JSON)
                      </div>
                      <el-input
                        model-value={requestBody.value}
                        onUpdate:model-value={(v: string) => { requestBody.value = v }}
                        type="textarea"
                        rows={3}
                        placeholder='{"key": "value"}'
                      />
                    </div>
                  )}

                  {/* 发送按钮 + 状态 */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <el-button
                      type="primary"
                      icon="Promotion"
                      onClick={sendRemoteProbe}
                      loading={remoteLoading.value}
                      disabled={!targetUrl.value.trim()}
                    >
                      {remoteLoading.value ? '请求中...' : '发送探针'}
                    </el-button>
                    {remoteResult.value && (
                      <span style={{ fontSize: '13px', color: '#67c23a', fontWeight: 600 }}>
                        ✅ 数据获取成功，可继续编写 JS 筛选
                      </span>
                    )}
                  </div>

                  {remoteError.value && (
                    <el-alert title={remoteError.value} type="error" closable={false} show-icon />
                  )}
                </div>
              </el-tab-pane>

              {/* ---- ✍️ 手动添加 ---- */}
              <el-tab-pane label="✍️ 手动添加" name="manual" class="manual-tab-pane">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: '#606266' }}>
                      粘贴 JSON 数据
                    </span>
                    <el-button size="small" icon="Operation" onClick={formatManualJson} text type="primary">
                      {'{} 格式化 JSON'}
                    </el-button>
                  </div>
                  <div class="probe-codemirror-wrapper probe-codemirror-wrapper--manual">
                    <Codemirror
                      model-value={manualJson.value}
                      onUpdate:model-value={(v: string) => { manualJson.value = v }}
                      extensions={[jsonExtension, themeExtension]}
                      onReady={onManualReady}
                      placeholder='粘贴当前数据集对象，例如：{"name":["A","B"],"value":[100,200]}'
                    />
                  </div>

                  {manualError.value && (
                    <el-alert title={manualError.value} type="error" closable={false} show-icon />
                  )}

                  {/* 按钮已统一移至底部操作栏 */}
                </div>
              </el-tab-pane>
            </el-tabs>
          </div>

          {/* ==================== 下半区：数据预览与过滤 ==================== */}
          {activeTab.value !== 'manual' && (
            <div class="probe-section probe-section--output">
              <div class="probe-section__title">📊 数据预览与过滤</div>
            <div class="probe-output-grid">
              {/* 原始数据 (只读) */}
              <div class="probe-output-pane">
                <div class="probe-output-pane__header">📦 原始数据 (只读)</div>
                <div class="probe-codemirror-wrapper probe-codemirror-wrapper--readonly">
                  <Codemirror
                    model-value={rawDataJson.value}
                    extensions={[jsonExtension, themeExtension]}
                    disabled={true}
                  />
                </div>
              </div>

              {/* JS 过滤器 */}
              <div class="probe-output-pane">
                <div class="probe-output-pane__header">🧹 JS 过滤器（返回当前数据集对象）</div>
                <div class="probe-codemirror-wrapper">
                  <Codemirror
                    model-value={filterCode.value}
                    onUpdate:model-value={(v: string) => { filterCode.value = v }}
                    extensions={[jsExtension, themeExtension]}
                  />
                </div>
              </div>
            </div>

            {/* 过滤器错误反馈 */}
            {filterError.value && (
              <div class="probe-filter-error">
                <strong>❌ {filterError.value}</strong>
              </div>
            )}
            </div>
          )}
        </div>

        {/* ==================== 底部操作栏 ==================== */}
        <div class="probe-footer">
          <el-button onClick={props.onClose}>取消</el-button>
          {activeTab.value === 'manual' ? (
            <el-button
              type="primary"
              icon="Upload"
              onClick={onParseAndMergeManual}
              disabled={!manualJson.value.trim()}
            >
              校验并导入
            </el-button>
          ) : (
            <div style={{ display: 'flex', gap: '10px' }}>
              <el-button
                type="warning"
                icon="View"
                onClick={onPreviewFilter}
                disabled={rawData.value === null}
              >
                预览结果
              </el-button>
              <el-button
                type="primary"
                icon="Upload"
                onClick={executeAndMerge}
                loading={executing.value}
                disabled={rawData.value === null}
              >
                校验并导入
              </el-button>
            </div>
          )}
        </div>

        {/* 过滤器效果预览弹窗 */}
        <el-dialog
          model-value={showPreviewDialog.value}
          onUpdate:model-value={(val: boolean) => { if (!val) showPreviewDialog.value = false }}
          title="🧹 筛选结果预览"
          width="760px"
          top="6vh"
          append-to-body
          destroy-on-close
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {pendingImportWarning.value && (
              <el-alert title={pendingImportWarning.value} type="warning" closable={false} show-icon />
            )}
            {pendingOverwriteFields.value.length > 0 && (
              <el-alert
                title={`将覆盖已有字段：${pendingOverwriteFields.value.join(', ')}`}
                type="warning"
                closable={false}
                show-icon
              />
            )}
          </div>
          <div style={{ height: '52vh', marginTop: '12px', border: '1px solid #dcdfe6', borderRadius: '6px', overflow: 'hidden' }}>
            <Codemirror
              model-value={previewResultJson.value}
              extensions={[jsonExtension, themeExtension]}
              disabled={true}
              style={{ height: '100%' }}
            />
          </div>
          <div style={{ marginTop: '14px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <el-button onClick={() => { showPreviewDialog.value = false }}>继续编辑 JS</el-button>
            <el-button type="primary" icon="Upload" onClick={importPreviewResult}>导入到当前数据集</el-button>
          </div>
        </el-dialog>

        <el-dialog
          model-value={showOverwriteDialog.value}
          onUpdate:model-value={(val: boolean) => { if (!val) resolveOverwrite(false) }}
          title="确认覆盖字段"
          width="480px"
          append-to-body
          close-on-click-modal={false}
          class="data-probe-overwrite-dialog"
        >
          {{
            default: () => (
              <div style={{ lineHeight: 1.7, color: '#303133' }}>
                以下字段已存在，导入后会被覆盖：
                <strong>{overwriteFields.value.join(', ')}</strong>
                。是否继续导入？
              </div>
            ),
            footer: () => (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <el-button onClick={() => resolveOverwrite(false)}>取消</el-button>
                <el-button type="primary" onClick={() => resolveOverwrite(true)}>确认导入</el-button>
              </div>
            ),
          }}
        </el-dialog>

        {/* ==================== 嵌入式样式（scoped via class） ==================== */}
        <style>{`
          .probe-layout {
            display: flex;
            flex-direction: column;
            gap: 16px;
            height: 72vh;
            min-height: 520px;
            overflow: hidden;
          }

          .probe-section {
            display: flex;
            flex-direction: column;
            overflow: hidden;
          }

          .probe-section--input {
            flex: 0 0 auto;
            max-height: 40%;
          }
          .probe-section--input .el-tabs__content {
            overflow-y: auto;
            max-height: 200px;
          }

          .probe-section--output {
            flex: 1 1 auto;
            min-height: 0;
          }

          .probe-section__title {
            font-size: 14px;
            font-weight: 700;
            color: #303133;
            margin-bottom: 8px;
            padding-bottom: 6px;
            border-bottom: 2px solid #409eff;
          }

          .probe-output-grid {
            display: flex;
            flex-direction: column;
            gap: 12px;
            flex: 1;
            min-height: 0;
          }

          .probe-output-pane {
            flex: 1 1 50%;
            display: flex;
            flex-direction: column;
            min-width: 0;
            overflow: hidden;
          }

          .probe-output-pane__header {
            font-size: 12px;
            font-weight: 600;
            color: #606266;
            margin-bottom: 4px;
          }

          .probe-codemirror-wrapper {
            flex: 1;
            min-height: 0;
            overflow: hidden;
            border: 1px solid #dcdfe6;
            border-radius: 6px;
          }
          .probe-codemirror-wrapper .cm-editor {
            height: 100%;
          }
          .probe-codemirror-wrapper .cm-scroller {
            overflow: auto !important;
          }

          .probe-codemirror-wrapper--manual {
            min-height: 160px;
            max-height: 200px;
          }

          .probe-codemirror-wrapper--readonly .cm-editor {
            opacity: 0.85;
          }

          .probe-filter-error {
            margin-top: 8px;
            padding: 10px 14px;
            background: #fef0f0;
            border-radius: 4px;
            border: 1px solid #fde2e2;
            font-size: 12px;
            color: #f56c6c;
            line-height: 1.6;
            word-break: break-all;
            flex-shrink: 0;
          }

          .probe-footer {
            margin-top: 16px;
            padding-top: 14px;
            border-top: 1px solid #ebeef5;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
          }

          /* === 手动模式覆盖样式 === */
          .probe-layout--manual .probe-section--input {
            flex: 1;
            max-height: 100%;
            display: flex;
            flex-direction: column;
          }
          .probe-layout--manual .probe-tabs {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-height: 0;
          }
          .probe-layout--manual .el-tabs__content {
            flex: 1;
            max-height: none;
            display: flex;
            flex-direction: column;
          }
          .probe-layout--manual .manual-tab-pane {
            flex: 1;
            display: flex;
            flex-direction: column;
          }
          .probe-layout--manual .probe-codemirror-wrapper--manual {
            flex: 1;
            max-height: none;
            box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.04);
            border: 1px solid #c0c4cc;
            border-radius: 8px;
          }
        `}</style>
      </el-dialog>
    )
  },
})
