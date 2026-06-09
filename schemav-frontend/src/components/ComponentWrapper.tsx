import { defineComponent, ref, computed, onMounted, onUnmounted, watch, type PropType } from 'vue'
import { useEditorStore, type ComponentInstance, type ChartSchema, type TableSchema, type TextSchema } from '../stores/editorStore'
import { buildChartOption, getChartBlockReason } from '../utils/chartOptions'
import VChart from 'vue-echarts'

/**
 * ComponentWrapper — 高阶包装组件（当前数据集升级）
 *
 * 职责：
 * 1. 为每个 ComponentInstance 生成绝对定位的容器
 * 2. 处理鼠标拖拽（移动）和右下角手柄缩放
 * 3. 选中态：蓝色边框 + 8 个缩放手柄
 * 4. Z-Index 管理 + 事件冒泡阻止
 *
 * 当前数据集升级：
 * - chartOption 直接从 store.globalData 读取数据
 * - 字段数组可直接绑定，数组对象可通过图表级 JS 转换
 */

// 缩放手柄的类型定义
type HandleDir = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e'

const HANDLE_SIZE = 10
/** 网格吸附单元尺寸（px），拖拽/缩放时强制对齐到该网格 */
const GRID_SIZE = 20

/** 将数值吸附到最近的网格点 */
const snapToGrid = (value: number): number =>
  Math.round(value / GRID_SIZE) * GRID_SIZE

export default defineComponent({
  name: 'ComponentWrapper',
  props: {
    component: {
      type: Object as PropType<ComponentInstance>,
      required: true,
    },
  },
  emits: [],
  setup(props) {
    const store = useEditorStore()

    // ===================== 派生状态 =====================

    const isSelected = computed(() => store.selectedComponentId === props.component.id)

    const wrapperStyle = computed(() => {
      const pos = props.component.position
      return {
        position: 'absolute' as const,
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        width: `${pos.w}px`,
        height: `${pos.h}px`,
        zIndex: props.component.zIndex,
      }
    })

    // ===================== 拖拽状态 =====================

    const isDragging = ref(false)
    const dragStartMouse = ref({ x: 0, y: 0 })
    const dragStartPos = ref({ x: 0, y: 0 })

    // ===================== 缩放状态 =====================

    const isResizing = ref(false)
    const resizeDir = ref<HandleDir | null>(null)
    const resizeStartMouse = ref({ x: 0, y: 0 })
    const resizeStartPos = ref({ x: 0, y: 0, w: 0, h: 0 })

    // ===================== ECharts 实例引用 =====================

    const chartRef = ref<InstanceType<typeof VChart> | null>(null)

    // ===================== ECharts Option（全局数据湖：从 globalData 读取数据） =====================

    const chartBlockReason = computed<string | null>(() => {
      const schema = props.component.props.chartSchema as ChartSchema | undefined
      return getChartBlockReason(schema, store.globalData)
    })

    const chartOption = computed(() => {
      const schema = props.component.props.chartSchema as ChartSchema | undefined
      if (!schema || !store.globalData || chartBlockReason.value !== null) return null
      return buildChartOption(schema, store.globalData)
    })

    const textSchema = computed<TextSchema>(() => {
      return (props.component.props.textSchema as TextSchema | undefined) ?? {
        content: '双击右侧配置文本',
        fontSize: 32,
        fontWeight: '600',
        color: '#303133',
        textAlign: 'center',
        background: 'transparent',
        padding: 16,
      }
    })

    const tableSchema = computed<TableSchema>(() => {
      return (props.component.props.tableSchema as TableSchema | undefined) ?? {
        title: '数据表格',
        dataKey: '',
        columns: [],
        maxRows: 8,
        showHeader: true,
      }
    })

    const tableRows = computed<Record<string, any>[]>(() => {
      const dataKey = tableSchema.value.dataKey
      if (!store.globalData || !dataKey) return []
      const rows = store.globalData[dataKey]
      if (!Array.isArray(rows)) return []
      return rows
        .filter((row) => row && typeof row === 'object' && !Array.isArray(row))
        .slice(0, Math.max(1, tableSchema.value.maxRows))
    })

    const tableColumns = computed(() => {
      const explicit = tableSchema.value.columns.filter((column) => column.visible)
      if (explicit.length > 0) return explicit
      if (tableRows.value.length === 0) return []
      return Object.keys(tableRows.value[0]).map((key) => ({ key, label: key, visible: true }))
    })

    // ===================== 键盘删除 =====================

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSelected.value) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // 防止浏览器后退（Backspace）或默认行为
        e.preventDefault()
        store.removeComponent(props.component.id)
      }
    }

    // ===================== 拖拽逻辑 =====================

    const onDragMouseDown = (e: MouseEvent) => {
      // 只在鼠标左键时拖拽
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      isDragging.value = true
      dragStartMouse.value = { x: e.clientX, y: e.clientY }
      dragStartPos.value = {
        x: props.component.position.x,
        y: props.component.position.y,
      }

      // 拖拽开始时选中组件
      store.selectComponent(props.component.id)
    }

    // ===================== 缩放逻辑 =====================

    const onResizeMouseDown = (dir: HandleDir, e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      isResizing.value = true
      resizeDir.value = dir
      resizeStartMouse.value = { x: e.clientX, y: e.clientY }
      resizeStartPos.value = {
        x: props.component.position.x,
        y: props.component.position.y,
        w: props.component.position.w,
        h: props.component.position.h,
      }
    }

    // ===================== 全局 mouseMove / mouseUp =====================

    const onMouseMove = (e: MouseEvent) => {
      // ---- 拖拽 ----
      if (isDragging.value) {
        const scale = store.canvasConfig.scale || 1
        const dx = (e.clientX - dragStartMouse.value.x) / scale
        const dy = (e.clientY - dragStartMouse.value.y) / scale

        store.updateComponentPosition(props.component.id, {
          x: snapToGrid(Math.max(0, dragStartPos.value.x + dx)),
          y: snapToGrid(Math.max(0, dragStartPos.value.y + dy)),
        })
        return
      }

      // ---- 缩放 ----
      if (isResizing.value && resizeDir.value) {
        const scale = store.canvasConfig.scale || 1
        const dx = (e.clientX - resizeStartMouse.value.x) / scale
        const dy = (e.clientY - resizeStartMouse.value.y) / scale
        const dir = resizeDir.value
        const sp = resizeStartPos.value

        let newX = sp.x
        let newY = sp.y
        let newW = sp.w
        let newH = sp.h

        // 右侧手柄
        if (dir.includes('e')) newW = Math.max(120, sp.w + dx)
        // 左侧手柄
        if (dir.includes('w')) {
          newW = Math.max(120, sp.w - dx)
          newX = sp.x + sp.w - newW
        }
        // 底部手柄
        if (dir.includes('s')) newH = Math.max(80, sp.h + dy)
        // 顶部手柄
        if (dir.includes('n')) {
          newH = Math.max(80, sp.h - dy)
          newY = sp.y + sp.h - newH
        }

        // 网格吸附：位置与尺寸均对齐至 GRID_SIZE
        store.updateComponentPosition(props.component.id, {
          x: snapToGrid(Math.max(0, newX)),
          y: snapToGrid(Math.max(0, newY)),
          w: snapToGrid(newW),
          h: snapToGrid(newH),
        })
        return
      }
    }

    const onMouseUp = () => {
      isDragging.value = false
      isResizing.value = false
      resizeDir.value = null
    }

    // ===================== 生命周期：挂载全局监听 =====================

    onMounted(() => {
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseup', onMouseUp)
      window.addEventListener('keydown', onKeyDown)
    })

    onUnmounted(() => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('keydown', onKeyDown)
    })

    // ===================== ECharts resize =====================

    // 当组件尺寸变化时，调用 ECharts 的 resize()
    // vue-echarts 通过 defineExpose 暴露 { chart: EChartsInstance }
    watch(
      () => ({
        w: props.component.position.w,
        h: props.component.position.h,
      }),
      () => {
        // 延迟确保 DOM 更新完成
        requestAnimationFrame(() => {
          const vc = chartRef.value
          if (vc) {
            const instance = (vc as any).chart
            if (instance && typeof instance.resize === 'function') {
              instance.resize()
            }
          }
        })
      },
    )

    // ===================== 渲染辅助 =====================

    const handleCursor = (dir: HandleDir): string => {
      if (dir === 'nw' || dir === 'se') return 'nwse-resize'
      if (dir === 'ne' || dir === 'sw') return 'nesw-resize'
      if (dir === 'n' || dir === 's') return 'ns-resize'
      return 'ew-resize'
    }

    // 渲染缩放手柄
    const renderHandle = (dir: HandleDir) => {
      const style: Record<string, string> = {
        position: 'absolute',
        width: `${HANDLE_SIZE}px`,
        height: `${HANDLE_SIZE}px`,
        background: '#409eff',
        border: '2px solid #fff',
        borderRadius: '2px',
        cursor: handleCursor(dir),
        zIndex: '10',
      }

      // 垂直位置
      if (dir.includes('n')) style.top = `-${HANDLE_SIZE / 2}px`
      else if (dir.includes('s')) style.bottom = `-${HANDLE_SIZE / 2}px`
      else style.top = '50%'

      // 水平位置
      if (dir.includes('w')) style.left = `-${HANDLE_SIZE / 2}px`
      else if (dir.includes('e')) style.right = `-${HANDLE_SIZE / 2}px`
      else style.left = '50%'

      if (!dir.includes('n') && !dir.includes('s')) {
        style.transform = 'translateY(-50%)'
      }
      if (!dir.includes('w') && !dir.includes('e')) {
        style.transform = 'translateX(-50%)'
      }
      if (
        (!dir.includes('n') && !dir.includes('s')) &&
        (!dir.includes('w') && !dir.includes('e'))
      ) {
        style.transform = 'translate(-50%, -50%)'
      }

      return (
        <div
          key={dir}
          style={style}
          onMousedown={(e: MouseEvent) => onResizeMouseDown(dir, e)}
          onPointerdown={(e: PointerEvent) => e.stopPropagation()}
        />
      )
    }

    const renderFloatingToolbar = () => (
      <div
        class="component-floating-toolbar"
        style={{
          position: 'absolute',
          top: '-34px',
          right: '0',
          height: '28px',
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          padding: '2px',
          background: '#0f172a',
          borderRadius: '4px',
          boxShadow: '0 6px 16px rgba(15, 23, 42, 0.18)',
          zIndex: '20',
        }}
        onMousedown={(e: MouseEvent) => e.stopPropagation()}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        <el-button
          link
          icon="CopyDocument"
          title="复制"
          style={{ color: '#fff', padding: '0 6px' }}
          onClick={store.duplicateSelectedComponent}
        />
        <el-button
          link
          icon="Top"
          title="置顶"
          style={{ color: '#fff', padding: '0 6px' }}
          onClick={store.bringSelectedToFront}
        />
        <el-button
          link
          icon="Bottom"
          title="置底"
          style={{ color: '#fff', padding: '0 6px' }}
          onClick={store.sendSelectedToBack}
        />
        <el-button
          link
          icon="Delete"
          title="删除"
          style={{ color: '#fff', padding: '0 6px' }}
          onClick={() => store.removeComponent(props.component.id)}
        />
      </div>
    )

    // ===================== 渲染 =====================

    return () => {
      const comp = props.component
      const type = comp.type

      return (
        <div
          class="component-wrapper"
          style={{
            ...wrapperStyle.value,
            background: '#fff',
            borderRadius: '8px',
            boxShadow: isSelected.value
              ? '0 0 0 2px #409eff, 0 4px 20px rgba(64, 158, 255, 0.25)'
              : '0 2px 12px rgba(0, 0, 0, 0.08)',
            overflow: 'hidden',
            transition: isDragging.value || isResizing.value ? 'none' : 'box-shadow 0.15s',
            cursor: isDragging.value ? 'grabbing' : 'grab',
          }}
          onMousedown={onDragMouseDown}
          onClick={(e: MouseEvent) => {
            e.stopPropagation()
            store.selectComponent(comp.id)
          }}
        >
          {/* ---- 内容区域 ---- */}
          <div style={{ width: '100%', height: '100%', pointerEvents: isDragging.value ? 'none' : 'auto' }}>
            {type.startsWith('chart-') ? (
              chartOption.value ? (
                <v-chart
                  ref={chartRef}
                  option={chartOption.value}
                  style={{ width: '100%', height: '100%' }}
                  autoresize
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: '8px',
                    color: '#909399',
                    fontSize: '14px',
                  }}
                >
                  <span>📊 图表组件</span>
                  <span style={{ fontSize: '12px', textAlign: 'center', padding: '0 16px' }}>
                    {chartBlockReason.value === 'no_global_data'
                      ? '请先在左侧创建当前数据集'
                      : chartBlockReason.value === 'field_not_found'
                        ? '全局数据中未找到对应字段'
                        : chartBlockReason.value === 'invalid_field_shape'
                          ? '字段值必须是数组，请检查当前数据集'
                          : chartBlockReason.value === 'length_mismatch'
                            ? 'X/Y 字段数组长度不一致'
                            : chartBlockReason.value === 'complex_x'
                              ? 'X 轴字段不能包含对象值'
                              : chartBlockReason.value === 'non_numeric_y' || chartBlockReason.value === 'non_numeric_value'
                                ? '数值字段必须是数值数组'
                        : chartBlockReason.value === 'no_binding'
                          ? '请在右侧配置面板绑定 X/Y 轴字段'
                          : chartBlockReason.value === 'no_custom_code'
                            ? '请输入手写 JS 转换代码'
                            : '请检查数据绑定配置'}
                  </span>
                </div>
              )
            ) : type === 'text' ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: textSchema.value.textAlign === 'left'
                    ? 'flex-start'
                    : textSchema.value.textAlign === 'right'
                      ? 'flex-end'
                      : 'center',
                  padding: `${textSchema.value.padding}px`,
                  background: textSchema.value.background || 'transparent',
                  color: textSchema.value.color,
                  fontSize: `${textSchema.value.fontSize}px`,
                  fontWeight: textSchema.value.fontWeight,
                  textAlign: textSchema.value.textAlign,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.25,
                }}
              >
                {textSchema.value.content}
              </div>
            ) : type === 'table' ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  background: '#fff',
                  color: '#303133',
                }}
              >
                {tableSchema.value.title && (
                  <div style={{ padding: '12px 14px 8px', fontSize: '15px', fontWeight: 700 }}>
                    {tableSchema.value.title}
                  </div>
                )}
                {tableRows.value.length === 0 || tableColumns.value.length === 0 ? (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#909399',
                    fontSize: '13px',
                  }}>
                    请选择数组对象数据集
                  </div>
                ) : (
                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '0 12px 12px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      {tableSchema.value.showHeader && (
                        <thead>
                          <tr>
                            {tableColumns.value.map((column) => (
                              <th key={column.key} style={{
                                position: 'sticky',
                                top: 0,
                                padding: '8px 10px',
                                textAlign: 'left',
                                background: '#f5f7fa',
                                borderBottom: '1px solid #ebeef5',
                                color: '#606266',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}>
                                {column.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody>
                        {tableRows.value.map((row, rowIndex) => (
                          <tr key={rowIndex}>
                            {tableColumns.value.map((column) => (
                              <td key={column.key} style={{
                                padding: '8px 10px',
                                borderBottom: '1px solid #f0f2f5',
                                whiteSpace: 'nowrap',
                                color: '#303133',
                              }}>
                                {String(row[column.key] ?? '')}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#909399',
                  fontSize: '14px',
                }}
              >
                {type}
              </div>
            )}
          </div>

          {/* ---- 选中态缩放手柄 ---- */}
          {isSelected.value &&
            (['nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e'] as HandleDir[]).map(renderHandle)}

          {isSelected.value && renderFloatingToolbar()}

          {/* ---- 选中态标题栏 ---- */}
          {isSelected.value && (
            <div
              style={{
                position: 'absolute',
                top: '-28px',
                left: '0',
                height: '24px',
                padding: '0 8px',
                background: '#409eff',
                color: '#fff',
                fontSize: '12px',
                lineHeight: '24px',
                borderRadius: '4px 4px 0 0',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              {comp.type} — {comp.id}
            </div>
          )}
        </div>
      )
    }
  },
})
