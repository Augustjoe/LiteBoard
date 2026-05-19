import { defineComponent, onMounted, ref, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useEditorStore } from '../stores/editorStore'
import { ElMessage } from 'element-plus'
import { Codemirror } from 'vue-codemirror'
import { json } from '@codemirror/lang-json'
import { oneDark } from '@codemirror/theme-one-dark'
import EditorHeader from '../components/EditorHeader'
import DataProbe from '../components/DataProbe'
import ChartRenderer from '../components/ChartRenderer'
import ChartConfigPanel from '../components/ChartConfigPanel'
import './EditorView.css'

/**
 * EditorView — 编辑器主视图（全局单一数据湖改造 v2）
 *
 * 左侧面板：
 * - globalData 为 null → 显示"初始化全局数据"按钮
 * - globalData 已挂载 → 展示只读预览 + "重新获取数据" + "✏️ 编辑数据"
 *
 * 新增功能：
 * - "编辑数据" 按钮 → 弹出全量编辑弹窗（vue-codemirror JSON 编辑器 + 格式化 + 保存并全量替换）
 */
export default defineComponent({
  name: 'EditorView',
  setup() {
    const store = useEditorStore()
    const route = useRoute()

    /** DataProbe 弹窗显隐 */
    const showProbeDialog = ref(false)

    /** 全量编辑全局数据弹窗显隐 */
    const showEditGlobalDataDialog = ref(false)

    /** 全量编辑弹窗中的 JSON 文本 */
    const editGlobalDataJson = ref('')

    const jsonExtension = json()
    const themeExtension = oneDark

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
      showEditGlobalDataDialog.value = true
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

    /** 保存并全量替换全局数据 */
    const saveAndReplace = () => {
      let parsed: any
      try {
        parsed = JSON.parse(editGlobalDataJson.value)
      } catch (err) {
        ElMessage.error('JSON 格式错误: ' + (err instanceof Error ? err.message : String(err)))
        return
      }

      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        ElMessage.error('数据必须是一个 JSON 对象 (Object)')
        return
      }

      store.replaceGlobalData(parsed as Record<string, any>)
      ElMessage.success('全局数据已全量替换')
      showEditGlobalDataDialog.value = false
    }

    return () => (
      <div class="editor-shell">
        {/* 顶部导航栏 */}
        <EditorHeader />

        {/* 主体区域 */}
        <div class="editor-body">
          {/* 左侧全局数据面板 — 全屏预览时隐藏 */}
          {!store.isFullscreenPreview && (
            <aside class="editor-panel editor-panel--left">
              <div class="asset-market">
                <div class="asset-market__header">
                  <h3 class="asset-market__title">🌐 全局数据</h3>
                </div>

                <div class="asset-market__list">
                  {store.globalData === null ? (
                    <div class="global-data-empty">
                      <el-empty description="尚未初始化全局数据" />
                      <div style={{ padding: '0 16px', marginTop: '-16px' }}>
                        <el-button
                          type="primary"
                          size="large"
                          icon="Upload"
                          onClick={() => { showProbeDialog.value = true }}
                          style={{ width: '100%' }}
                        >
                          初始化全局数据
                        </el-button>
                      </div>
                    </div>
                  ) : (
                    <div class="global-data-mounted">
                      <div class="global-data-status">
                        <span style={{ color: '#67c23a', fontWeight: 600, fontSize: '14px' }}>
                          ✅ 全局数据已挂载
                        </span>
                      </div>

                      <div class="global-data-preview">
                        <div style={{ fontSize: '12px', fontWeight: 600, color: '#606266', marginBottom: '6px' }}>
                          📋 数据预览（只读）
                        </div>
                        <el-input
                          type="textarea"
                          readonly
                          rows={12}
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
                          🔄 重新获取数据
                        </el-button>
                        <el-button
                          type="default"
                          icon="Edit"
                          onClick={openEditGlobalData}
                          style={{ width: '100%' }}
                        >
                          ✏️ 编辑数据
                        </el-button>
                      </div>
                    </div>
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

        {/* 超级探针弹窗 */}
        <DataProbe
          visible={showProbeDialog.value}
          onClose={() => { showProbeDialog.value = false }}
        />

        {/* 全量编辑全局数据弹窗 */}
        <el-dialog
          model-value={showEditGlobalDataDialog.value}
          onUpdate:model-value={(val: boolean) => { if (!val) showEditGlobalDataDialog.value = false }}
          title="✏️ 全量编辑全局数据"
          width="700px"
          top="5vh"
          destroy-on-close
          close-on-click-modal={false}
          class="edit-global-data-dialog"
        >
          <div class="edit-global-data-body">
            <div class="edit-global-data-editor">
              <Codemirror
                model-value={editGlobalDataJson.value}
                onUpdate:model-value={(v: string) => { editGlobalDataJson.value = v }}
                extensions={[jsonExtension, themeExtension]}
              />
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
            <el-button icon="Operation" onClick={formatEditJson}>
              格式化
            </el-button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <el-button onClick={() => { showEditGlobalDataDialog.value = false }}>
                取消
              </el-button>
              <el-button type="primary" icon="Check" onClick={saveAndReplace}>
                保存并全量替换
              </el-button>
            </div>
          </div>

          {/* 嵌入式样式 */}
          <style>{`
            .edit-global-data-body {
              display: flex;
              flex-direction: column;
              height: 50vh;
              min-height: 320px;
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
