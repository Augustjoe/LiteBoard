import { defineComponent, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useEditorStore, type DataAsset } from '../stores/editorStore'
import EditorHeader from '../components/EditorHeader'
import DataProbe from '../components/DataProbe'
import ChartRenderer from '../components/ChartRenderer'
import ChartConfigPanel from '../components/ChartConfigPanel'
import './EditorView.css'

/**
 * EditorView — 编辑器主视图（数据湖改造）
 *
 * 左侧面板变更为"资产超市"UI：
 * - 顶部"添加数据资产"按钮 → 打开 DataProbe 双模弹窗
 * - 下方展示已入库资产列表（卡片式），无资产时显示 el-empty
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const store = useEditorStore()
    const route = useRoute()

    /** DataProbe 弹窗显隐 */
    const showProbeDialog = ref(false)

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

    const onRemoveAsset = (assetId: string) => {
      store.removeAsset(assetId)
    }

    const onProbeSaved = (asset: DataAsset) => {
      store.addAsset(asset)
      showProbeDialog.value = false
    }

    return () => (
      <div class="editor-shell">
        {/* 顶部导航栏 */}
        <EditorHeader />

        {/* 主体区域 */}
        <div class="editor-body">
          {/* 左侧资产超市 — 全屏预览时隐藏 */}
          {!store.isFullscreenPreview && (
            <aside class="editor-panel editor-panel--left">
              <div class="asset-market">
                <div class="asset-market__header">
                  <h3 class="asset-market__title">📦 数据资产超市</h3>
                  <el-button
                    type="primary"
                    icon="Plus"
                    onClick={() => { showProbeDialog.value = true }}
                  >
                    添加数据资产
                  </el-button>
                </div>

                {/* 资产列表 */}
                <div class="asset-market__list">
                  {store.assets.length === 0 ? (
                    <el-empty description="暂无数据资产，点击上方按钮添加" />
                  ) : (
                    store.assets.map((asset) => (
                      <div key={asset.id} class="asset-card">
                        <div class="asset-card__header">
                          <span class="asset-card__name">{asset.name}</span>
                          <el-button
                            type="danger"
                            size="small"
                            icon="Delete"
                            plain
                            onClick={() => onRemoveAsset(asset.id)}
                          >
                            删除
                          </el-button>
                        </div>
                        <div class="asset-card__meta">
                          <span>ID: {asset.id}</span>
                          <span>字段: {asset.fields.length > 0 ? asset.fields.join(', ') : '—'}</span>
                        </div>
                        <div class="asset-card__data-type">
                          {Array.isArray(asset.data)
                            ? `📋 数组模式 · ${asset.data.length} 条记录`
                            : '🧩 复杂对象模式'}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
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

        {/* 双模超级探针弹窗 */}
        <DataProbe
          visible={showProbeDialog.value}
          onClose={() => { showProbeDialog.value = false }}
          onSaved={onProbeSaved}
        />
      </div>
    )
  },
})
