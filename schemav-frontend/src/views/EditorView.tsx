import { defineComponent } from 'vue'
import { useEditorStore } from '../stores/editorStore'
import EditorHeader from '../components/EditorHeader'
import DataProbe from '../components/DataProbe'
import ChartRenderer from '../components/ChartRenderer'
import ChartConfigPanel from '../components/ChartConfigPanel'
import './EditorView.css'

/**
 * EditorView — 编辑器主视图（Node 5 升级）
 *
 * 新增：
 * - EditorHeader 顶部导航栏（保存、清空、导出代码、全屏预览）
 * - 全屏预览模式：隐藏左右面板，仅显示画布
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const store = useEditorStore()

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
