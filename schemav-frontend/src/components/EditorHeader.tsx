import { defineComponent, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEditorStore } from '../stores/editorStore'
import { generateVueCode, downloadVueFile } from '../utils/codeGenerator'

/**
 * EditorHeader — 顶部导航栏（Node 5 新增）
 *
 * 功能：
 * - 项目名称标识
 * - 【保存项目】→ localStorage 持久化
 * - 【清空画布】→ 重置所有组件
 * - 【导出代码】→ 弹出代码预览对话框，支持复制/下载 .vue 文件
 * - 【全屏预览】→ 进入只读模式，隐藏所有编辑器面板
 */
export default defineComponent({
  name: 'EditorHeader',
  setup() {
    const store = useEditorStore()

    // ==================== 导出代码对话框 ====================
    const codeDialogVisible = ref(false)
    const generatedCode = ref('')
    const copySuccess = ref(false)

    /** 打开导出代码对话框 */
    const onExportCode = () => {
      const schema = store.currentSchema
      const code = generateVueCode(schema, store.rawData)
      generatedCode.value = code
      codeDialogVisible.value = true
      copySuccess.value = false
    }

    /** 复制代码到剪贴板 */
    const onCopyCode = async () => {
      try {
        await navigator.clipboard.writeText(generatedCode.value)
        copySuccess.value = true
        setTimeout(() => {
          copySuccess.value = false
        }, 2000)
      } catch {
        // 降级方案：使用 textarea 复制
        const textarea = document.createElement('textarea')
        textarea.value = generatedCode.value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        copySuccess.value = true
        setTimeout(() => {
          copySuccess.value = false
        }, 2000)
      }
    }

    /** 下载 .vue 文件 */
    const onDownloadCode = () => {
      const filename = `${store.title || 'dashboard'}.vue`
      downloadVueFile(generatedCode.value, filename)
    }

    // ==================== 其他操作 ====================

    const onSave = () => {
      store.saveSchema()
      ElMessage.success('项目已保存到本地存储')
    }

    const onClearCanvas = () => {
      ElMessageBox.confirm(
        '确定要清空画布上的所有组件吗？此操作不可撤销。',
        '清空画布',
        {
          confirmButtonText: '确定清空',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
        .then(() => {
          store.clearCanvas()
          ElMessage.success('画布已清空')
        })
        .catch(() => {
          // 用户取消
        })
    }

    const onFullscreenPreview = () => {
      store.toggleFullscreenPreview()
    }

    return () => (
      <header
        class="editor-header"
        style={{
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          background: '#fff',
          borderBottom: '1px solid #e4e7ed',
          boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
          zIndex: 100,
          flexShrink: 0,
        }}
      >
        {/* 左侧：品牌标识 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            fontSize: '18px',
            fontWeight: 700,
            color: '#409eff',
            letterSpacing: '0.5px',
          }}>
            📊 LiteBoard
          </div>
          <el-divider direction="vertical" />
          <el-input
            model-value={store.title}
            onUpdate:model-value={(val: string) => store.setTitle(val)}
            placeholder="项目名称"
            size="small"
            style={{ width: '200px' }}
            clearable
          />
        </div>

        {/* 右侧：操作按钮组 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <el-button
            type="primary"
            icon="FolderChecked"
            size="default"
            onClick={onSave}
          >
            保存项目
          </el-button>

          <el-button
            type="warning"
            icon="Delete"
            size="default"
            plain
            onClick={onClearCanvas}
          >
            清空画布
          </el-button>

          <el-divider direction="vertical" />

          <el-button
            type="success"
            icon="Document"
            size="default"
            onClick={onExportCode}
          >
            导出代码
          </el-button>

          <el-button
            type={store.isFullscreenPreview ? 'danger' : 'info'}
            icon={store.isFullscreenPreview ? 'Close' : 'FullScreen'}
            size="default"
            plain
            onClick={onFullscreenPreview}
          >
            {store.isFullscreenPreview ? '退出预览' : '全屏预览'}
          </el-button>
        </div>

        {/* ==================== 导出代码对话框 ==================== */}
        <el-dialog
          v-model={codeDialogVisible.value}
          title="📤 导出 Vue 组件代码"
          width="80%"
          top="5vh"
          close-on-click-modal={false}
          onClose={() => {
            codeDialogVisible.value = false
          }}
        >
          {{
            default: () => (
              <div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}>
                  <span style={{ fontSize: '13px', color: '#909399' }}>
                    以下代码可直接复制到 .vue 文件中运行（需安装 echarts、vue-echarts）
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <el-button
                      type="primary"
                      icon="CopyDocument"
                      size="small"
                      onClick={onCopyCode}
                    >
                      {copySuccess.value ? '已复制 ✓' : '点击复制'}
                    </el-button>
                    <el-button
                      type="success"
                      icon="Download"
                      size="small"
                      onClick={onDownloadCode}
                    >
                      下载 .vue 文件
                    </el-button>
                  </div>
                </div>

                <el-input
                  type="textarea"
                  rows={24}
                  model-value={generatedCode.value}
                  readonly
                  style={{
                    width: '100%',
                    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
                    fontSize: '13px',
                    lineHeight: '1.6',
                  }}
                />
              </div>
            ),
            footer: () => (
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <el-button onClick={() => { codeDialogVisible.value = false }}>
                  关闭
                </el-button>
              </div>
            ),
          }}
        </el-dialog>
      </header>
    )
  },
})
