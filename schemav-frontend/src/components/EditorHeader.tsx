import { computed, defineComponent, ref, type PropType } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useEditorStore, type ChartType } from '../stores/editorStore'
import { generateVueCode, downloadVueFile } from '../utils/codeGenerator'
import { CHART_META, CORE_CHART_TYPES } from '../utils/chartOptions'

export default defineComponent({
  name: 'EditorHeader',
  props: {
    rightPanelVisible: {
      type: Boolean,
      default: true,
    },
    onAddChart: {
      type: Function as PropType<(type: ChartType) => void>,
      required: true,
    },
    onAddText: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onAddTable: {
      type: Function as PropType<() => void>,
      required: true,
    },
    onToggleRightPanel: {
      type: Function as PropType<() => void>,
      required: true,
    },
  },
  setup(props) {
    const store = useEditorStore()
    const router = useRouter()

    const codeDialogVisible = ref(false)
    const generatedCode = ref('')
    const copySuccess = ref(false)

    const saveLabel = computed(() => {
      if (store.saveStatus === 'saving') return '保存中'
      if (store.saveStatus === 'dirty') return '未保存'
      if (store.saveStatus === 'saved') return '已保存'
      if (store.saveStatus === 'error') return '保存失败'
      return '待编辑'
    })

    const saveTagType = computed(() => {
      if (store.saveStatus === 'dirty') return 'warning'
      if (store.saveStatus === 'saved') return 'success'
      if (store.saveStatus === 'error') return 'danger'
      return 'info'
    })

    const onExportCode = () => {
      generatedCode.value = generateVueCode(store.currentSchema)
      codeDialogVisible.value = true
      copySuccess.value = false
    }

    const onCopyCode = async () => {
      try {
        await navigator.clipboard.writeText(generatedCode.value)
      } catch {
        const textarea = document.createElement('textarea')
        textarea.value = generatedCode.value
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
    }

    const onDownloadCode = () => {
      downloadVueFile(generatedCode.value, `${store.title || 'dashboard'}.vue`)
    }

    const onSave = async () => {
      if (!store.currentTaskId) {
        ElMessage.warning('无法保存：当前没有关联任务')
        return
      }
      const ok = await store.saveTask()
      if (ok) ElMessage.success('仪表盘已保存')
      else ElMessage.error('保存失败，请重试')
    }

    const onClearCanvas = () => {
      ElMessageBox.confirm(
        '确定要清空画布上的所有组件吗？此操作不可撤销。',
        '清空画布',
        {
          confirmButtonText: '确认清空',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
        .then(() => {
          store.clearCanvas()
          ElMessage.success('画布已清空')
        })
        .catch(() => {})
    }

    const renderIconButton = (
      title: string,
      icon: string,
      onClick: () => void,
      extraClass = '',
      type?: 'primary' | 'danger',
      loading = false,
    ) => (
      <el-tooltip content={title} placement="bottom" show-after={250}>
        <el-button
          class={`editor-header__icon-button ${extraClass}`}
          type={type}
          icon={icon}
          size="small"
          text={!type}
          loading={loading}
          onClick={onClick}
        />
      </el-tooltip>
    )

    return () => (
      <header class="editor-header">
        <div class="editor-header__left">
          <el-tooltip content="返回大厅" placement="bottom" show-after={250}>
            <el-button
              class="editor-header__back"
              text
              icon="ArrowLeft"
              onClick={() => router.push('/')}
            />
          </el-tooltip>
          <div class="editor-header__brand">LiteBoard</div>
          <el-input
            class="editor-header__title"
            model-value={store.title}
            onUpdate:model-value={(val: string) => store.setTitle(val)}
            placeholder="仪表盘名称"
            size="small"
            clearable
          />
          {store.saveStatus !== 'idle' && (
            <el-tag class="editor-header__save-tag" type={saveTagType.value} effect="dark" round>
              {saveLabel.value}
            </el-tag>
          )}
        </div>

        {!store.isFullscreenPreview && (
          <div class="editor-header__center">
            <el-dropdown
              trigger="click"
              popper-class="editor-chart-dropdown"
              onCommand={(type: ChartType) => props.onAddChart(type)}
            >
              {{
                default: () => (
                  <button class="editor-header__tool" type="button">
                    <span class="editor-header__tool-icon">◔</span>
                    <span>图表</span>
                  </button>
                ),
                dropdown: () => (
                  <el-dropdown-menu>
                    {CORE_CHART_TYPES.map((type) => (
                      <el-dropdown-item key={type} command={type}>
                        <span class="editor-tool-menu-item">
                          <span>{CHART_META[type].icon}</span>
                          <span>{CHART_META[type].label}</span>
                        </span>
                      </el-dropdown-item>
                    ))}
                  </el-dropdown-menu>
                ),
              }}
            </el-dropdown>
            <button class="editor-header__tool" type="button" onClick={() => props.onAddText()}>
              <span class="editor-header__tool-icon">T</span>
              <span>富文本</span>
            </button>
            <button class="editor-header__tool" type="button" onClick={() => props.onAddTable()}>
              <span class="editor-header__tool-icon">▦</span>
              <span>表格</span>
            </button>
          </div>
        )}

        <div class="editor-header__right">
          {!store.isFullscreenPreview && (
            <el-popover trigger="click" placement="bottom-end" width={280}>
              {{
                reference: () => (
                  <el-button
                    class="editor-header__icon-button"
                    title="画布设置"
                    icon="Setting"
                    size="small"
                    text
                  />
                ),
                default: () => (
                  <div class="canvas-settings-popover">
                    <div class="canvas-settings-popover__title">画布设置</div>
                    <el-form label-position="top" size="small">
                      <div class="canvas-settings-popover__grid">
                        <el-form-item label="宽度">
                          <el-input-number
                            model-value={store.canvasConfig.width}
                            onUpdate:model-value={(v: number) => store.updateCanvasConfig({ width: v })}
                            controls={false}
                            style={{ width: '100%' }}
                          />
                        </el-form-item>
                        <el-form-item label="高度">
                          <el-input-number
                            model-value={store.canvasConfig.height}
                            onUpdate:model-value={(v: number) => store.updateCanvasConfig({ height: v })}
                            controls={false}
                            style={{ width: '100%' }}
                          />
                        </el-form-item>
                      </div>
                      <el-form-item label="缩放比例">
                        <el-slider
                          model-value={store.canvasConfig.scale * 100}
                          onUpdate:model-value={(v: number) => store.updateCanvasConfig({ scale: v / 100 })}
                          min={50}
                          max={200}
                          step={10}
                          format-tooltip={(v: number) => `${v}%`}
                        />
                      </el-form-item>
                    </el-form>
                  </div>
                ),
              }}
            </el-popover>
          )}
          {renderIconButton(store.isFullscreenPreview ? '退出预览' : '全屏预览', store.isFullscreenPreview ? 'Close' : 'View', () => store.toggleFullscreenPreview())}
          {renderIconButton('保存', 'FolderChecked', onSave, 'editor-header__icon-button--primary', 'primary', store.saveStatus === 'saving')}
          {renderIconButton('导出 Vue', 'Document', onExportCode)}
          {!store.isFullscreenPreview && renderIconButton(props.rightPanelVisible ? '收起配置' : '展开配置', props.rightPanelVisible ? 'Fold' : 'Expand', props.onToggleRightPanel)}
          {!store.isFullscreenPreview && renderIconButton('清空画布', 'Delete', onClearCanvas, 'editor-header__icon-button--danger', 'danger')}
        </div>

        <el-dialog
          v-model={codeDialogVisible.value}
          title="导出仪表盘 Vue 组件"
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
                <div class="export-dialog-toolbar">
                  <span>以下代码可复制到 .vue 文件中运行，需要安装 echarts 与 vue-echarts。</span>
                  <div class="export-dialog-actions">
                    <el-button type="primary" icon="CopyDocument" size="small" onClick={onCopyCode}>
                      {copySuccess.value ? '已复制' : '复制代码'}
                    </el-button>
                    <el-button type="success" icon="Download" size="small" onClick={onDownloadCode}>
                      下载 .vue
                    </el-button>
                  </div>
                </div>
                <el-input
                  type="textarea"
                  rows={24}
                  model-value={generatedCode.value}
                  readonly
                  class="export-dialog-code"
                />
              </div>
            ),
            footer: () => (
              <el-button onClick={() => { codeDialogVisible.value = false }}>
                关闭
              </el-button>
            ),
          }}
        </el-dialog>
      </header>
    )
  },
})
