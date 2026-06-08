import { defineComponent, onMounted, ref, computed, nextTick } from 'vue'
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

    /** 折叠面板激活项，默认展开当前数据集和组件添加 */
    const activeCollapse = ref(['canvas-config', 'global-data', 'add-component'])

    /** 画布内容容器引用 */
    const canvasContentRef = ref<HTMLElement | null>(null)

    /** 左/右面板宽度和显示状态 */
    const leftPanelWidth = ref(350)
    const rightPanelWidth = ref(320)
    const isLeftPanelVisible = ref(true)
    const isRightPanelVisible = ref(true)

    const leftPanelShouldShow = computed(() => !store.isFullscreenPreview && isLeftPanelVisible.value)
    const rightPanelShouldShow = computed(() => !store.isFullscreenPreview && store.selectedComponent !== null && isRightPanelVisible.value)

    const onLeftResizeStart = (e: MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = leftPanelWidth.value
      const maxW = window.innerWidth * 0.4
      const onMove = (me: MouseEvent) => {
        let w = startWidth + (me.clientX - startX)
        w = Math.max(200, Math.min(w, maxW))
        leftPanelWidth.value = w
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    const onRightResizeStart = (e: MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = rightPanelWidth.value
      const maxW = window.innerWidth * 0.4
      const onMove = (me: MouseEvent) => {
        let w = startWidth - (me.clientX - startX)
        w = Math.max(200, Math.min(w, maxW))
        rightPanelWidth.value = w
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    }

    /** 新增组件配置弹窗显隐 */
    const showConfigDialog = ref(false)

    /** 新增组件的临时状态 */
    const pendingType = ref<ChartType>('bar')
    const pendingX = ref(150)
    const pendingY = ref(150)

    // 配置表单状态
    const configTitle = ref('自定义图表')
    const configChartType = ref<ChartType>('bar')
    const configColor = ref('#409eff')
    const configUseJS = ref(false)
    const configXField = ref('')
    const configYField = ref('')
    const configNameField = ref('')
    const configValueField = ref('')
    const configJSCode = ref(`// res 是当前仪表盘数据集对象。请返回处理后的新数据对象。
// 格式要求：return { xAxis: [...], yAxis: [...] };
return {
  xAxis: Object.keys(res),
  yAxis: Object.values(res)
};`)
    const configJSError = ref<string | null>(null)

    const chartTypesUsingXY = new Set<ChartType>(['bar', 'line', 'scatter'])
    const chartTypesUsingNameValue = new Set<ChartType>(['pie', 'funnel'])

    // 拖拽与点击逻辑
    const onDragStart = (e: DragEvent, type: ChartType) => {
      e.dataTransfer?.setData('text/plain', type)
    }

    const getDefaultTitle = (type: ChartType) => `新建${CHART_META[type]?.label ?? '图表'}`

    const resetChartConfig = (type: ChartType) => {
      configTitle.value = getDefaultTitle(type)
      configChartType.value = type
      configColor.value = '#409eff'
      configUseJS.value = type === 'radar'
      const defaults = store.getDefaultChartFields()
      configXField.value = defaults.xAxisField
      configYField.value = defaults.yAxisField
      configNameField.value = store.getDefaultNameField()
      configValueField.value = store.getDefaultValueField()
      configJSCode.value = type === 'radar'
        ? `// res 是当前仪表盘数据集对象。\n// 请返回雷达图数据：{ indicator: [{ name: '销售', max: 100 }], value: [80] }\nreturn {\n  indicator: Object.keys(res).map((key) => ({ name: key, max: 100 })),\n  value: Object.values(res).map((list) => Array.isArray(list) ? Number(list[0]) || 0 : 0)\n};`
        : `// res 是当前仪表盘数据集对象。\n// 柱/线/散点返回 { xAxis: [...], yAxis: [...] }\n// 饼/漏斗返回 { name: [...], value: [...] }\n// 仪表盘返回 { value: [...] }\nreturn {\n  xAxis: Object.keys(res),\n  yAxis: Object.values(res).map((list) => Array.isArray(list) ? list.length : 0)\n};`
    }

    const onComponentClick = (type: ChartType) => {
      pendingType.value = type
      pendingX.value = 150
      pendingY.value = 150
      resetChartConfig(type)
      showConfigDialog.value = true
    }

    const openConfigModal = (type: ChartType, x: number, y: number) => {
      pendingType.value = type
      pendingX.value = x
      pendingY.value = y
      resetChartConfig(type)
      showConfigDialog.value = true
    }

    const addTextComponent = () => {
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
    }

    const addTableComponent = () => {
      const dataKey = store.getTableDataKeys()[0] ?? ''
      const tableSchema: TableSchema = {
        title: '数据表格',
        dataKey,
        columns: dataKey ? store.inferTableColumns(dataKey) : [],
        maxRows: 8,
        showHeader: true,
      }
      store.addComponent('table', { tableSchema })
    }

    const handleConfirmConfig = () => {
      configJSError.value = null

      if (configUseJS.value) {
        try {
          const fn = new Function('res', configJSCode.value)
          const testData = store.globalData || {}
          const testResult = fn(testData)
          if (!testResult || typeof testResult !== 'object') {
            configJSError.value = 'JS 代码返回值必须是一个包含 xAxis 和 yAxis 数组的对象！'
            return
          }
        } catch (err) {
          configJSError.value = 'JS 代码执行异常: ' + (err instanceof Error ? err.message : String(err))
          return
        }
      } else {
        if (chartTypesUsingXY.has(configChartType.value) && (!configXField.value || !configYField.value)) {
          ElMessage.error('请绑定 X 轴与 Y 轴的数据字段')
          return
        }
        if (chartTypesUsingNameValue.has(configChartType.value) && (!configNameField.value || !configValueField.value)) {
          ElMessage.error('请绑定名称字段与数值字段')
          return
        }
        if (configChartType.value === 'gauge' && !configValueField.value) {
          ElMessage.error('请绑定仪表盘数值字段')
          return
        }
      }

      store.addComponent(`chart-${configChartType.value}`, {
        chartSchema: {
          chartType: configChartType.value,
          xAxisField: configXField.value,
          yAxisField: configYField.value,
          nameField: configNameField.value,
          valueField: configValueField.value,
          title: configTitle.value,
          color: configColor.value,
          useCustomDataCode: configUseJS.value,
          customDataCode: configJSCode.value,
          customOption: '{}',
        },
      })
      if (store.selectedComponent) {
        store.updateComponentPosition(store.selectedComponent.id, {
          x: pendingX.value,
          y: pendingY.value,
          w: configChartType.value === 'gauge' ? 360 : 480,
          h: 320,
        })
      }
      
      ElMessage.success('图表组件添加成功')
      showConfigDialog.value = false
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
        {/* 顶部导航栏 */}
        <EditorHeader />

        {/* 主体区域 */}
        <div class="editor-body">
          {/* 左侧数据集与组件添加面板 */}
          {leftPanelShouldShow.value && (
            <aside class="editor-panel editor-panel--left" style={{ width: `${leftPanelWidth.value}px`, display: 'flex', flexDirection: 'column', overflowY: 'auto', position: 'relative' }}>
              <div class="resize-handle resize-handle-left" onMousedown={onLeftResizeStart}></div>
              <div style={{ padding: '8px', borderBottom: '1px solid #ebeef5', display: 'flex', justifyContent: 'flex-end' }}>
                <el-button link size="small" onClick={() => isLeftPanelVisible.value = false}>◀ 折叠面板</el-button>
              </div>
              <el-collapse model-value={activeCollapse.value} onUpdate:model-value={(val: any) => { activeCollapse.value = val }}>
                <el-collapse-item name="canvas-config">
                  {{
                    title: () => <span style={{ fontSize: '14px', fontWeight: 'bold', paddingLeft: '8px' }}>📐 画布调整</span>,
                    default: () => (
                      <div style={{ padding: '10px' }}>
                        <el-form label-position="top" size="small">
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <el-form-item label="宽度 (px)" style={{ flex: 1, marginBottom: '10px' }}>
                              <el-input-number model-value={store.canvasConfig.width} onUpdate:model-value={(v: number) => store.updateCanvasConfig({ width: v })} controls={false} style={{ width: '100%' }} />
                            </el-form-item>
                            <el-form-item label="高度 (px)" style={{ flex: 1, marginBottom: '10px' }}>
                              <el-input-number model-value={store.canvasConfig.height} onUpdate:model-value={(v: number) => store.updateCanvasConfig({ height: v })} controls={false} style={{ width: '100%' }} />
                            </el-form-item>
                          </div>
                          <el-form-item label="缩放比例" style={{ marginBottom: 0 }}>
                            <el-slider model-value={store.canvasConfig.scale * 100} onUpdate:model-value={(v: number) => store.updateCanvasConfig({ scale: v / 100 })} min={50} max={200} step={10} format-tooltip={(v: number) => `${v}%`} />
                          </el-form-item>
                        </el-form>
                      </div>
                    )
                  }}
                </el-collapse-item>
                <el-collapse-item name="global-data">
                  {{
                    title: () => <span style={{ fontSize: '14px', fontWeight: 'bold', paddingLeft: '8px' }}>🌐 当前数据集</span>,
                    default: () => (
                      <div class="asset-market__list" style={{ padding: '10px' }}>
                        {store.globalData === null ? (
                          <div class="global-data-empty">
                            <el-empty description="尚未创建当前仪表盘数据集" />
                            <div style={{ padding: '0 16px', marginTop: '-16px' }}>
                              <el-button
                                type="primary"
                                size="large"
                                icon="Upload"
                                onClick={() => { showProbeDialog.value = true }}
                                style={{ width: '100%' }}
                              >
                                创建数据集
                              </el-button>
                            </div>
                          </div>
                        ) : (
                          <div class="global-data-mounted">
                            <div class="global-data-status">
                              <span style={{ color: '#67c23a', fontWeight: 600, fontSize: '14px' }}>
                                ✅ 当前数据集已就绪
                              </span>
                            </div>

                            <div class="global-data-preview">
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#606266', marginBottom: '6px' }}>
                                📋 数据集预览（只读）
                              </div>
                              <el-input
                                type="textarea"
                                readonly
                                rows={8}
                                model-value={JSON.stringify(store.globalData, null, 2)}
                                style={{ width: '100%' }}
                              />
                            </div>

                            <div style={{ padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <el-button
                                type="warning"
                                icon="Refresh"
                                onClick={() => { showProbeDialog.value = true }}
                                style={{ width: '100%' }}
                              >
                                更新当前数据集
                              </el-button>
                              <el-button
                                type="default"
                                icon="Edit"
                                onClick={openEditGlobalData}
                                style={{ width: '100%' }}
                              >
                                ✏️ 编辑数据集
                              </el-button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }}
                </el-collapse-item>

                <el-collapse-item name="add-component">
                  {{
                    title: () => <span style={{ fontSize: '14px', fontWeight: 'bold', paddingLeft: '8px' }}>🧩 添加组件</span>,
                    default: () => (
                      <div class="add-component-panel" style={{ padding: '10px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#606266', marginBottom: '8px' }}>
                          基础组件
                        </div>
                        <div class="component-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                          <div class="component-card-item" onClick={addTextComponent} style={{
                            border: '1px solid #dcdfe6',
                            borderRadius: '6px',
                            padding: '12px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: '#fff',
                            transition: 'all 0.2s',
                            userSelect: 'none'
                          }}>
                            <div style={{ fontSize: '22px', marginBottom: '6px' }}>T</div>
                            <div style={{ fontSize: '12px', fontWeight: '600' }}>文本/标题</div>
                          </div>
                          <div class="component-card-item" onClick={addTableComponent} style={{
                            border: '1px solid #dcdfe6',
                            borderRadius: '6px',
                            padding: '12px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            background: '#fff',
                            transition: 'all 0.2s',
                            userSelect: 'none'
                          }}>
                            <div style={{ fontSize: '22px', marginBottom: '6px' }}>▦</div>
                            <div style={{ fontSize: '12px', fontWeight: '600' }}>普通表格</div>
                          </div>
                        </div>

                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#606266', marginBottom: '8px' }}>
                          图表组件
                        </div>
                        <div class="component-card-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          {CORE_CHART_TYPES.map((type) => (
                            <div
                              class="component-card-item"
                              draggable={true}
                              onDragstart={(e: DragEvent) => onDragStart(e, type)}
                              onClick={() => onComponentClick(type)}
                              style={{
                                border: '1px solid #dcdfe6',
                                borderRadius: '6px',
                                padding: '12px',
                                textAlign: 'center',
                                cursor: 'grab',
                                background: '#fff',
                                transition: 'all 0.2s',
                                userSelect: 'none'
                              }}
                            >
                              <div style={{ fontSize: '22px', marginBottom: '6px' }}>{CHART_META[type].icon}</div>
                              <div style={{ fontSize: '12px', fontWeight: '600' }}>{CHART_META[type].label}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: '11px', color: '#909399', marginTop: '12px', textAlign: 'center' }}>
                          提示：图表和表格优先使用当前数据集，文本可直接添加。
                        </div>
                      </div>
                    )
                  }}
                </el-collapse-item>
              </el-collapse>
            </aside>
          )}

          {/* 左侧折叠开关 */}
          {!store.isFullscreenPreview && !isLeftPanelVisible.value && (
            <div class="panel-toggle-btn toggle-left" onClick={() => isLeftPanelVisible.value = true}>
              ▶
            </div>
          )}

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
                openConfigModal(type, x, y)
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

          {/* 右侧折叠开关 */}
          {!store.isFullscreenPreview && store.selectedComponent !== null && !isRightPanelVisible.value && (
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
              <ChartConfigPanel />
            </aside>
          )}
        </div>

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

        {/* 新增组件初始化配置弹窗 */}
        <el-dialog
          model-value={showConfigDialog.value}
          onUpdate:model-value={(val: boolean) => { if (!val) showConfigDialog.value = false }}
          title={`🧩 初始化图表配置 — ${CHART_META[pendingType.value]?.label ?? '图表'}`}
          width="650px"
          top="10vh"
          close-on-click-modal={false}
          destroy-on-close
        >
          <el-form label-width="120px">
            {/* 基础配置段 */}
            <h4 style={{ margin: '0 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>基础属性</h4>
            
            <el-form-item label="图表标题">
              <el-input model-value={configTitle.value} onUpdate:model-value={(v: string) => { configTitle.value = v }} placeholder="如: 月度销量统计" />
            </el-form-item>
            
            <el-form-item label="图表类型">
              <el-select
                model-value={configChartType.value}
                onUpdate:model-value={(v: ChartType) => {
                  resetChartConfig(v)
                  pendingType.value = v
                }}
                style={{ width: '100%' }}
              >
                {CORE_CHART_TYPES.map((type) => (
                  <el-option key={type} label={`${CHART_META[type].icon} ${CHART_META[type].label}`} value={type} />
                ))}
              </el-select>
            </el-form-item>

            <el-form-item label="主题颜色">
              <el-color-picker model-value={configColor.value} onUpdate:model-value={(v: string) => { configColor.value = v || '#409eff' }} />
            </el-form-item>

            {/* 数据来源段 */}
            <h4 style={{ margin: '20px 0 10px 0', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>数据来源</h4>
            
            <el-form-item label="配置模式">
              <el-radio-group model-value={configUseJS.value} onUpdate:model-value={(v: boolean) => { configUseJS.value = v }}>
                <el-radio label={false} disabled={configChartType.value === 'radar'}>数据集字段选择</el-radio>
                <el-radio label={true}>手写 JS 代码转换</el-radio>
              </el-radio-group>
            </el-form-item>

            {!configUseJS.value && chartTypesUsingXY.has(configChartType.value) ? (
              <>
                <el-form-item label="X 轴绑定字段">
                  <el-select model-value={configXField.value} onUpdate:model-value={(v: string) => { configXField.value = v }} placeholder="选择维度字段" style={{ width: '100%' }}>
                    {store.availableFields.map(f => (
                      <el-option key={f} label={f} value={f} />
                    ))}
                  </el-select>
                </el-form-item>
                <el-form-item label="Y 轴绑定字段">
                  <el-select model-value={configYField.value} onUpdate:model-value={(v: string) => { configYField.value = v }} placeholder="选择指标字段" style={{ width: '100%' }}>
                    {store.availableFields.map(f => (
                      <el-option key={f} label={f} value={f} />
                    ))}
                  </el-select>
                </el-form-item>
              </>
            ) : !configUseJS.value && chartTypesUsingNameValue.has(configChartType.value) ? (
              <>
                <el-form-item label="名称字段">
                  <el-select model-value={configNameField.value} onUpdate:model-value={(v: string) => { configNameField.value = v }} placeholder="选择名称字段" style={{ width: '100%' }}>
                    {store.availableFields.map(f => (
                      <el-option key={f} label={f} value={f} />
                    ))}
                  </el-select>
                </el-form-item>
                <el-form-item label="数值字段">
                  <el-select model-value={configValueField.value} onUpdate:model-value={(v: string) => { configValueField.value = v }} placeholder="选择数值字段" style={{ width: '100%' }}>
                    {store.availableFields.map(f => (
                      <el-option key={f} label={f} value={f} />
                    ))}
                  </el-select>
                </el-form-item>
              </>
            ) : !configUseJS.value && configChartType.value === 'gauge' ? (
              <el-form-item label="数值字段">
                <el-select model-value={configValueField.value} onUpdate:model-value={(v: string) => { configValueField.value = v }} placeholder="选择数值字段" style={{ width: '100%' }}>
                  {store.availableFields.map(f => (
                    <el-option key={f} label={f} value={f} />
                  ))}
                </el-select>
              </el-form-item>
            ) : !configUseJS.value && configChartType.value === 'radar' ? (
              <div style={{ margin: '0 0 10px 120px' }}>
                <el-alert title="雷达图 v1 使用 JS 转换生成 indicator/value" type="info" closable={false} />
              </div>
            ) : (
              <div style={{ margin: '0 0 10px 120px' }}>
                <div style={{ fontSize: '12px', color: '#909399', marginBottom: '6px' }}>
                  变量 <strong>res</strong> 代表当前仪表盘数据集。请按当前图表类型返回对应数组。
                </div>
                <div style={{ border: '1px solid #dcdfe6', borderRadius: '6px', overflow: 'hidden', height: '200px' }}>
                  <Codemirror
                    model-value={configJSCode.value}
                    onUpdate:model-value={(v: string) => { configJSCode.value = v }}
                    extensions={[jsExtension, themeExtension]}
                  />
                </div>
                {configJSError.value && (
                  <div style={{ color: '#f56c6c', fontSize: '12px', marginTop: '6px' }}>
                    ❌ {configJSError.value}
                  </div>
                )}
              </div>
            )}
          </el-form>
          
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <el-button onClick={() => { showConfigDialog.value = false }}>取消</el-button>
            <el-button type="primary" onClick={handleConfirmConfig}>确定并上屏</el-button>
          </div>
        </el-dialog>
      </div>
    )
  },
})
