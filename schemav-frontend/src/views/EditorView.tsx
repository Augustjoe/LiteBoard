import { defineComponent, onMounted, ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useEditorStore, type ChartType, type DataPool, type TableSchema, type TextSchema } from '../stores/editorStore'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'
import EditorHeader from '../components/EditorHeader'
import DataProbe from '../components/DataProbe'
import ChartRenderer from '../components/ChartRenderer'
import ChartConfigPanel from '../components/ChartConfigPanel'
import { validateDataPoolResult } from '../utils/dataPool'
import { CHART_META, CORE_CHART_TYPES } from '../utils/chartOptions'
import './EditorView.css'

/**
 * EditorView — 编辑器主视图（全局单一数据湖改造 v2）
 *
 * 左侧面板：
 * - globalData 为 null → 显示"创建数据集"按钮
 * - globalData 已挂载 → 展示只读预览 + "更新数据集" + "✏️ 编辑数据集"
 *
 * 新增功能：
 * - "编辑数据集" 按钮 → 弹出全量编辑弹窗（vue-codemirror JSON 编辑器 + JS 筛选 + 保存替换）
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const store = useEditorStore()
    const route = useRoute()

    /** DataProbe 弹窗显隐 */
    const showProbeDialog = ref(false)

    /** 全量编辑当前数据集弹窗显隐 */
    const showEditGlobalDataDialog = ref(false)

    /** 全量编辑弹窗中的 JSON 文本 */
    const editGlobalDataJson = ref('')
    const editGlobalDataMode = ref<'json' | 'js'>('json')
    const editGlobalDataCode = ref(`// data 是当前编辑器里的数据集对象。
// 请返回新的数据集对象：{ 字段名或数据集名: [...] }。
return data;`)
    const editGlobalDataError = ref<string | null>(null)

    const jsonExtension = json()
    const jsExtension = javascript()
    const themeExtension = oneDark

    /** 画布内容容器引用 */
    const canvasContentRef = ref<HTMLElement | null>(null)

    /** 右侧面板宽度和显示状态 */
    const rightPanelWidth = ref(560)
    const isRightPanelVisible = ref(true)
    const showDataManagerDialog = ref(false)

    const rightPanelShouldShow = computed(() => !store.isFullscreenPreview && isRightPanelVisible.value)

    const onRightResizeStart = (e: MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = rightPanelWidth.value
      const maxW = window.innerWidth * 0.4
      const onMove = (me: MouseEvent) => {
        let w = startWidth - (me.clientX - startX)
        w = Math.max(360, Math.min(w, maxW))
        rightPanelWidth.value = w
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    const chartTypesUsingXY = new Set<ChartType>(['bar', 'line', 'scatter'])
    const chartTypesUsingNameValue = new Set<ChartType>(['pie', 'funnel'])

    const getDefaultTitle = (type: ChartType) => `新建${CHART_META[type]?.label ?? '图表'}`

    const getDefaultCustomDataCode = (type: ChartType) => type === 'radar'
      ? `// res 是当前仪表盘数据集对象。
// 请返回雷达图数据：{ indicator: [{ name: '销售', max: 100 }], value: [80] }
return {
  indicator: Object.keys(res).map((key) => ({ name: key, max: 100 })),
  value: Object.values(res).map((list) => Array.isArray(list) ? Number(list[0]) || 0 : 0)
};`
      : `// res 是当前仪表盘数据集对象。
// 柱/线/散点返回 { xAxis: [...], yAxis: [...] }
// 饼/漏斗返回 { name: [...], value: [...] }
// 仪表盘返回 { value: [...] }
return {
  xAxis: Object.keys(res),
  yAxis: Object.values(res).map((list) => Array.isArray(list) ? list.length : 0)
};`

    const getChartProps = (type: ChartType) => {
      const defaults = store.getDefaultChartFields()
      return {
        chartSchema: {
          chartType: type,
          xAxisField: chartTypesUsingXY.has(type) ? defaults.xAxisField : '',
          yAxisField: chartTypesUsingXY.has(type) ? defaults.yAxisField : '',
          nameField: chartTypesUsingNameValue.has(type) ? store.getDefaultNameField() : '',
          valueField: chartTypesUsingNameValue.has(type) || type === 'gauge' ? store.getDefaultValueField() : '',
          title: getDefaultTitle(type),
          color: '#409eff',
          useCustomDataCode: type === 'radar',
          customDataCode: getDefaultCustomDataCode(type),
          customOption: '{}',
        },
      }
    }

    const addChartComponent = (type: ChartType, position?: { x: number; y: number }) => {
      store.addComponent(`chart-${type}`, getChartProps(type))
      if (store.selectedComponent && position) {
        store.updateComponentPosition(store.selectedComponent.id, {
          x: position.x,
          y: position.y,
          w: type === 'gauge' ? 360 : 480,
          h: 320,
        })
      }
      ElMessage.success(`${CHART_META[type]?.label ?? '图表'}已添加`)
    }

    const addTextComponent = (position?: { x: number; y: number }) => {
      const textSchema: TextSchema = {
        content: '仪表盘标题',
        fontSize: 36,
        fontWeight: '700',
        color: '#303133',
        textAlign: 'center',
        background: 'transparent',
        padding: 16,
      }
      store.addComponent('text', { textSchema })
      if (store.selectedComponent && position) {
        store.updateComponentPosition(store.selectedComponent.id, position)
      }
    }

    const addTableComponent = (position?: { x: number; y: number }) => {
      const dataKey = store.getTableDataKeys()[0] ?? ''
      const tableSchema: TableSchema = {
        title: '数据表格',
        dataKey,
        columns: dataKey ? store.inferTableColumns(dataKey) : [],
        maxRows: 8,
        showHeader: true,
      }
      store.addComponent('table', { tableSchema })
      if (store.selectedComponent && position) {
        store.updateComponentPosition(store.selectedComponent.id, {
          ...position,
          w: 560,
          h: 320,
        })
      }
    }

    onMounted(async () => {
      const taskId = route.params.taskId as string | undefined
      if (taskId) {
        console.log(`[EditorView] 正在加载任务: ${taskId}`)
        const ok = await store.loadTask(taskId)
        if (!ok) {
          console.warn(`[EditorView] 任务加载失败: ${taskId}`)
        }
      } else {
        console.log('[EditorView] 无 taskId，显示空白编辑器')
        store.resetAll()
      }
    })

    /** 打开全量编辑弹窗 — 以当前 globalData 序列化值初始化编辑器 */
    const openEditGlobalData = () => {
      editGlobalDataJson.value = JSON.stringify(store.globalData, null, 2)
      editGlobalDataMode.value = 'json'
      editGlobalDataError.value = null
      showEditGlobalDataDialog.value = true
    }

    const openDataManager = () => {
      showDataManagerDialog.value = true
    }

    const openProbeFromManager = () => {
      showDataManagerDialog.value = false
      showProbeDialog.value = true
    }

    const openEditFromManager = () => {
      showDataManagerDialog.value = false
      openEditGlobalData()
    }

    const parseEditJson = (): unknown => {
      if (!editGlobalDataJson.value.trim()) {
        throw new Error('JSON 不能为空')
      }
      return JSON.parse(editGlobalDataJson.value)
    }

    const getEditedDataPool = (): DataPool | null => {
      editGlobalDataError.value = null
      let result: unknown

      try {
        const parsed = parseEditJson()
        if (editGlobalDataMode.value === 'js') {
          const fn = new Function('data', editGlobalDataCode.value)
          result = fn(parsed)
        } else {
          result = parsed
        }
      } catch (err) {
        editGlobalDataError.value = (editGlobalDataMode.value === 'js' ? 'JS 执行异常: ' : 'JSON 格式错误: ') +
          (err instanceof Error ? err.message : String(err))
        return null
      }

      const validation = validateDataPoolResult(result)
      if (!validation.ok) {
        editGlobalDataError.value = validation.message
        return null
      }
      if (validation.warning) {
        editGlobalDataError.value = validation.warning
      }
      return validation.data
    }

    /** 格式化编辑弹窗中的 JSON */
    const formatEditJson = () => {
      try {
        const parsed = JSON.parse(editGlobalDataJson.value)
        editGlobalDataJson.value = JSON.stringify(parsed, null, 2)
      } catch (err) {
        ElMessage.error('JSON 格式错误，无法格式化: ' + (err instanceof Error ? err.message : String(err)))
      }
    }

    const previewEditJsResult = () => {
      const data = getEditedDataPool()
      if (!data) return
      editGlobalDataJson.value = JSON.stringify(data, null, 2)
      editGlobalDataMode.value = 'json'
      ElMessage.success('JS 结果已写入左侧 JSON 草稿，确认后可保存替换')
    }

    /** 保存并全量替换当前数据集 */
    const saveAndReplace = () => {
      const data = getEditedDataPool()
      if (!data) return

      ElMessageBox.confirm('确定保存并覆盖当前数据集吗？这会替换当前仪表盘的整个数据集。', '提示', { type: 'warning' }).then(() => {
        store.replaceGlobalData(data)
        ElMessage.success('当前数据集已替换')
        showEditGlobalDataDialog.value = false
      }).catch(() => {})
    }

    return () => (
      <div class="editor-shell">
        <EditorHeader
          rightPanelVisible={isRightPanelVisible.value}
          onAddChart={(type: ChartType) => addChartComponent(type)}
          onAddText={() => addTextComponent()}
          onAddTable={() => addTableComponent()}
          onToggleRightPanel={() => { isRightPanelVisible.value = !isRightPanelVisible.value }}
        />

        {/* 主体区域 */}
        <div class="editor-body">
          {/* 中间主工作区 — 点阵网格画布 */}
          <main
            class="editor-main"
            style={{
              flex: store.isFullscreenPreview ? '1 1 100%' : undefined,
              position: 'relative'
            }}
            onDragover={(e: DragEvent) => {
              e.preventDefault()
            }}
            onDrop={(e: DragEvent) => {
              e.preventDefault()
              const type = e.dataTransfer?.getData('text/plain') as ChartType | undefined
              if (type && CORE_CHART_TYPES.includes(type)) {
                const canvasEl = canvasContentRef.value
                if (!canvasEl) return
                const rect = canvasEl.getBoundingClientRect()
                const scale = store.canvasConfig.scale || 1
                const x = Math.max(0, (e.clientX - rect.left) / scale - 240) // center size offset
                const y = Math.max(0, (e.clientY - rect.top) / scale - 160)
                addChartComponent(type, { x, y })
              }
            }}
          >
            <div class="editor-canvas">
              <div 
                class="canvas-content" 
                ref={canvasContentRef}
                style={{
                  width: `${store.canvasConfig.width}px`,
                  height: `${store.canvasConfig.height}px`,
                  transform: `scale(${store.canvasConfig.scale || 1})`
                }}
              >
                <ChartRenderer />
              </div>
            </div>
          </main>

          {!store.isFullscreenPreview && !isRightPanelVisible.value && (
            <div class="panel-toggle-btn toggle-right" onClick={() => isRightPanelVisible.value = true}>
              ◀
            </div>
          )}

          {/* 右侧配置区 */}
          {rightPanelShouldShow.value && (
            <aside class="editor-panel editor-panel--right" style={{ width: `${rightPanelWidth.value}px`, position: 'relative' }}>
              <div class="resize-handle resize-handle-right" onMousedown={onRightResizeStart}></div>
              <div style={{ padding: '8px', borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'flex-start' }}>
                <el-button link size="small" onClick={() => isRightPanelVisible.value = false}>▶ 折叠面板</el-button>
              </div>
              <ChartConfigPanel onOpenDataManager={openDataManager} />
            </aside>
          )}
        </div>

        <el-dialog
          model-value={showDataManagerDialog.value}
          onUpdate:model-value={(val: boolean) => { showDataManagerDialog.value = val }}
          title="当前数据集管理"
          width="720px"
          top="8vh"
        >
          <div class="data-manager-dialog">
            {store.globalData === null ? (
              <el-empty description="尚未创建当前数据集" />
            ) : (
              <div class="data-manager-summary">
                {store.dataPoolEntries.map((entry) => (
                  <div class="data-manager-summary__item" key={entry.name}>
                    <div class="data-manager-summary__name">{entry.name}</div>
                    <div class="data-manager-summary__meta">{entry.kind} · {entry.length} 条</div>
                  </div>
                ))}
              </div>
            )}
            <div class="data-manager-actions">
              <el-button type="primary" icon="Refresh" onClick={openProbeFromManager}>
                更新数据集
              </el-button>
              <el-button icon="Edit" onClick={openEditFromManager} disabled={store.globalData === null}>
                全量编辑 / JS 清洗
              </el-button>
            </div>
          </div>
        </el-dialog>

        {/* 超级探针弹窗 */}
        <DataProbe
          visible={showProbeDialog.value}
          onClose={() => { showProbeDialog.value = false }}
        />

        {/* 全量编辑当前数据集弹窗 */}
        <el-dialog
          model-value={showEditGlobalDataDialog.value}
          onUpdate:model-value={(val: boolean) => { 
            if (!val) {
              showEditGlobalDataDialog.value = false 
            }
          }}
          title="✏️ 全量编辑当前数据集"
          width="92vw"
          top="2vh"
          draggable
          destroy-on-close
          close-on-click-modal={false}
          class="edit-global-data-dialog"
        >
          <div class="edit-global-data-body">
            <div class="edit-global-data-toolbar">
              <el-radio-group
                model-value={editGlobalDataMode.value}
                onUpdate:model-value={(v: 'json' | 'js') => { editGlobalDataMode.value = v }}
              >
                <el-radio-button label="json">JSON 全量编辑</el-radio-button>
                <el-radio-button label="js">JS 筛选</el-radio-button>
              </el-radio-group>
              {editGlobalDataError.value && (
                <el-alert title={editGlobalDataError.value} type={editGlobalDataError.value.includes('长度不一致') ? 'warning' : 'error'} closable={false} show-icon />
              )}
            </div>

            <div class={['edit-global-data-grid', editGlobalDataMode.value === 'json' && 'edit-global-data-grid--single']}>
              <section class="edit-global-data-pane">
                <div class="edit-global-data-pane__header">当前数据集 JSON 草稿</div>
                <div class="edit-global-data-editor">
                  <Codemirror
                    model-value={editGlobalDataJson.value}
                    onUpdate:model-value={(v: string) => { editGlobalDataJson.value = v }}
                    extensions={[jsonExtension, themeExtension]}
                  />
                </div>
              </section>

              {editGlobalDataMode.value === 'js' && (
                <section class="edit-global-data-pane">
                  <div class="edit-global-data-pane__header">JS 筛选器</div>
                  <div class="edit-global-data-editor">
                    <Codemirror
                      model-value={editGlobalDataCode.value}
                      onUpdate:model-value={(v: string) => { editGlobalDataCode.value = v }}
                      extensions={[jsExtension, themeExtension]}
                    />
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* 底部操作栏 */}
          <div style={{
            marginTop: '16px',
            paddingTop: '14px',
            borderTop: '1px solid #ebeef5',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ display: 'flex', gap: '10px' }}>
              <el-button icon="Operation" onClick={formatEditJson}>
                格式化 JSON
              </el-button>
              {editGlobalDataMode.value === 'js' && (
                <el-button type="warning" icon="View" onClick={previewEditJsResult}>
                  预览 JS 结果
                </el-button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <el-button onClick={() => { 
                showEditGlobalDataDialog.value = false 
              }}>
                取消
              </el-button>
              <el-button type="primary" icon="Check" onClick={saveAndReplace}>
                保存并替换当前数据集
              </el-button>
            </div>
          </div>

          {/* 嵌入式样式 */}
          <style>{`
            .el-dialog.edit-global-data-dialog {
              max-width: 1180px;
              min-width: 760px;
              resize: both;
              overflow: hidden;
            }
            .edit-global-data-dialog .el-dialog__body {
              padding-top: 12px;
            }
            .edit-global-data-body {
              display: flex;
              flex-direction: column;
              height: 72vh;
              min-height: 540px;
            }
            .edit-global-data-toolbar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 16px;
              margin-bottom: 12px;
              min-height: 34px;
            }
            .edit-global-data-toolbar .el-alert {
              flex: 1;
              padding: 4px 10px;
            }
            .edit-global-data-grid {
              flex: 1;
              min-height: 0;
              display: grid;
              grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
              gap: 12px;
            }
            .edit-global-data-grid--single {
              grid-template-columns: minmax(0, 1fr);
            }
            .edit-global-data-pane {
              min-height: 0;
              display: flex;
              flex-direction: column;
            }
            .edit-global-data-pane__header {
              font-size: 12px;
              font-weight: 700;
              color: #606266;
              margin-bottom: 6px;
            }
            .edit-global-data-editor {
              flex: 1;
              min-height: 0;
              border: 1px solid #dcdfe6;
              border-radius: 6px;
              overflow: hidden;
            }
            .edit-global-data-editor .cm-editor {
              height: 100%;
            }
            .edit-global-data-editor .cm-scroller {
              overflow: auto !important;
            }
          `}</style>
        </el-dialog>

      </div>
    )
  },
})
