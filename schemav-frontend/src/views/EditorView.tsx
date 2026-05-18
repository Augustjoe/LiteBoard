import { defineComponent, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useEditorStore } from '../stores/editorStore'
import EditorHeader from '../components/EditorHeader'
import DataProbe from '../components/DataProbe'
import ChartRenderer from '../components/ChartRenderer'
import ChartConfigPanel from '../components/ChartConfigPanel'
import './EditorView.css'

/**
 * EditorView — 编辑器主视图（全栈重构 阶段 4）
 *
 * 变更：
 * - onMounted 中通过 route.params.taskId 调用 store.loadTask(taskId)
 * - 若无 taskId（直接访问 /editor 不带参数），显示空编辑器
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const store = useEditorStore()
    const route = useRoute()

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

    return () => (
      <div class="editor-shell">
        {/* 顶部导航栏 */}
        <EditorHeader />

        {/* 主体区域 */}
        <div class="editor-body">
          {/* 左侧探针区 — 全屏预览时隐藏 */}
          {!store.isFullscreenPreview && (
            <aside class="editor-panel editor-panel--left">
              <DataProbe />
            </aside>
          )}

          {/* 中间主工作区 — 点阵网格画布 */}
          <main
            class="editor-main"
            style={{
              flex: store.isFullscreenPreview ? '1 1 100%' : undefined,
            }}
          >
            <div class="editor-canvas">
              <ChartRenderer />
            </div>
          </main>

          {/* 右侧配置区 — 全屏预览时隐藏 */}
          {!store.isFullscreenPreview && (
            <aside class="editor-panel editor-panel--right">
              <ChartConfigPanel />
            </aside>
          )}
        </div>
      </div>
    )
  },
})
