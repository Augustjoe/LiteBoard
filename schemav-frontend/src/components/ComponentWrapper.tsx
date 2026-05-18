import { defineComponent, ref, computed, onMounted, onUnmounted, watch, type PropType } from 'vue'
import { merge } from 'lodash-es'
import { useEditorStore, type ComponentInstance, type ChartSchema } from '../stores/editorStore'
import VChart from 'vue-echarts'

/**
 * ComponentWrapper — 高阶包装组件（Node 6 升级）
 *
 * 职责：
 * 1. 为每个 ComponentInstance 生成绝对定位的容器
 * 2. 处理鼠标拖拽（移动）和右下角手柄缩放
 * 3. 选中态：蓝色边框 + 8 个缩放手柄
 * 4. Z-Index 管理 + 事件冒泡阻止
 *
 * Node 6 升级：
 * - chartOption 从 store.assets 中查找绑定资产的数据
 * - 未绑定 assetId 时显示引导提示
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

    // ===================== ECharts Option（Node 6：从 assets 读取数据） =====================

    /** 图表未就绪的原因枚举（null = 已就绪） */
    const chartBlockReason = computed<string | null>(() => {
      const schema = props.component.props.chartSchema as ChartSchema | undefined

      if (!schema || !schema.xAxisField || !schema.yAxisField || !schema.assetId) {
        return 'no_binding'
      }

      const asset = store.assets.find((a) => a.id === schema.assetId)
      if (!asset || !asset.data) {
        return 'no_asset'
      }

      // 🛡️ 数据湖防崩溃兜底：如果 data 不是 Array，ECharts 无法消费
      if (!Array.isArray(asset.data)) {
        return 'complex_object'
      }

      if (asset.data.length === 0) {
        return 'empty'
      }

      return null
    })

    const chartOption = computed(() => {
      if (chartBlockReason.value !== null) {
        return null
      }

      const schema = props.component.props.chartSchema as ChartSchema | undefined
      if (!schema) return null

      const asset = store.assets.find((a) => a.id === schema.assetId)
      if (!asset || !Array.isArray(asset.data)) return null

      const { xAxisField, yAxisField, chartType } = schema

      // 基础图表配置
      const baseOption = {
        title: {
          text: `${chartType === 'bar' ? '柱状图' : '折线图'} — ${yAxisField}`,
          left: 'center',
          top: 8,
          textStyle: {
            fontSize: 16,
            fontWeight: 600,
            color: '#303133',
          },
        },
        tooltip: {
          trigger: 'axis' as const,
        },
        legend: {
          data: [yAxisField],
          bottom: 8,
        },
        grid: {
          left: '5%',
          right: '5%',
          top: 48,
          bottom: 48,
          containLabel: true,
        },
        xAxis: {
          type: 'category' as const,
          data: asset.data.map((item) =>
            String(item[xAxisField] ?? ''),
          ),
          axisLabel: {
            rotate: asset.data.length > 8 ? 30 : 0,
            fontSize: 11,
          },
        },
        yAxis: {
          type: 'value' as const,
          name: yAxisField,
        },
        series: [
          {
            name: yAxisField,
            type: chartType,
            data: asset.data.map((item) => {
              const val = Number(item[yAxisField])
              return Number.isNaN(val) ? 0 : val
            }),
            emphasis: {
              focus: 'series' as const,
            },
            animationDelay: (idx: number) => idx * 50,
          },
        ],
      }

      // 尝试解析用户自定义 JSON 配置，安全深度合并
      const customStr = schema.customOption
      if (!customStr || customStr === '{}') {
        return baseOption
      }

      try {
        const parsed = JSON.parse(customStr)
        // merge 深度合并：customOption 覆盖 baseOption 同名字段
        return merge({}, baseOption, parsed)
      } catch (err) {
        console.warn('[ChartRenderer] customOption JSON 解析失败，已回退到基础配置：', err)
        return baseOption
      }
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
        const dx = e.clientX - dragStartMouse.value.x
        const dy = e.clientY - dragStartMouse.value.y

        store.updateComponentPosition(props.component.id, {
          x: snapToGrid(Math.max(0, dragStartPos.value.x + dx)),
          y: snapToGrid(Math.max(0, dragStartPos.value.y + dy)),
        })
        return
      }

      // ---- 缩放 ----
      if (isResizing.value && resizeDir.value) {
        const dx = e.clientX - resizeStartMouse.value.x
        const dy = e.clientY - resizeStartMouse.value.y
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
                    {chartBlockReason.value === 'complex_object'
                      ? '数据格式为复杂对象，请等待右侧数据映射器配置'
                      : store.assets.length === 0
                        ? '请先在左侧资产超市添加数据资产'
                        : '请在右侧配置面板绑定数据资产'}
                  </span>
                </div>
              )
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
