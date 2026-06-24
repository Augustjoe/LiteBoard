import { createRequire } from 'node:module'

const FRONTEND_URL = process.env.LITEBOARD_FRONTEND_URL || 'http://localhost:5173'
const SERVER_URL = process.env.LITEBOARD_SERVER_URL || 'http://localhost:3000'
const CDP_PORT = Number(process.env.LITEBOARD_CDP_PORT || 9224)
const CDP_URL = `http://localhost:${CDP_PORT}`
const require = createRequire(import.meta.url)
const { parse, compileScript, compileTemplate } = require('../schemav-frontend/node_modules/@vue/compiler-sfc')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(`${res.status} ${text}`)
  return data
}

async function waitForHttp(url, label) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {}
    await sleep(500)
  }
  throw new Error(`${label} is not reachable: ${url}`)
}

async function getChromePage() {
  let pages
  try {
    pages = await (await fetch(`${CDP_URL}/json`)).json()
  } catch (err) {
    throw new Error(
      `Chrome DevTools is not reachable at ${CDP_URL}. Start Chrome with --remote-debugging-port=${CDP_PORT}. ${err.message}`,
    )
  }
  const page = pages.find((item) => item.type === 'page') || pages[0]
  if (!page?.webSocketDebuggerUrl) throw new Error('No Chrome page target found')
  return page
}

async function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  let seq = 1
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    if (!msg.id || !pending.has(msg.id)) return
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = seq++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })

  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }

  return {
    send,
    evaluate,
    close: () => {
      if (ws.readyState === 1) ws.close()
    },
  }
}

function assertStep(condition, message, details) {
  if (!condition) {
    const suffix = details ? `\n${JSON.stringify(details, null, 2)}` : ''
    throw new Error(`${message}${suffix}`)
  }
}

function validateExportedVueCode(code) {
  try {
    const parsed = parse(code, { filename: 'LiteBoardExport.vue' })
    const parseErrors = parsed.errors.map((err) => String(err.message || err))
    if (parseErrors.length > 0) {
      return { ok: false, stage: 'parse', errors: parseErrors }
    }

    const descriptor = parsed.descriptor
    if (!descriptor.template) {
      return { ok: false, stage: 'parse', errors: ['Missing <template> block'] }
    }
    if (!descriptor.scriptSetup && !descriptor.script) {
      return { ok: false, stage: 'parse', errors: ['Missing <script> block'] }
    }

    if (descriptor.scriptSetup) {
      compileScript(descriptor, { id: 'liteboard-export' })
    }

    const templateResult = compileTemplate({
      id: 'liteboard-export',
      filename: 'LiteBoardExport.vue',
      source: descriptor.template.content,
    })
    const templateErrors = templateResult.errors.map((err) => String(err.message || err))
    if (templateErrors.length > 0) {
      return { ok: false, stage: 'template', errors: templateErrors }
    }

    return {
      ok: true,
      hasTemplate: true,
      hasScript: Boolean(descriptor.scriptSetup || descriptor.script),
      styleBlocks: descriptor.styles.length,
      codeLength: code.length,
    }
  } catch (err) {
    return { ok: false, stage: 'exception', errors: [err instanceof Error ? err.message : String(err)] }
  }
}

async function seedTask() {
  const task = await jsonFetch(`${SERVER_URL}/api/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      name: '[AUDIT] MVP browser flow',
      description: 'Temporary task created by scripts/verify-mvp-flow.mjs',
    }),
  })
  return task.id
}

function pointerClickScript(selector, index = 0) {
  return `(() => {
    const nodes = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = nodes[${index}];
    if (!el) {
      return {
        ok: false,
        selector: ${JSON.stringify(selector)},
        index: ${index},
        count: nodes.length,
        body: document.body.innerText.slice(0, 1200),
      };
    }
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    el.click();
    return { ok: true, selector: ${JSON.stringify(selector)}, index: ${index}, text: el.innerText, cls: String(el.className) };
  })()`
}

async function run() {
  await waitForHttp(`${SERVER_URL}/api/tasks`, 'server')
  await waitForHttp(FRONTEND_URL, 'frontend')

  const taskId = await seedTask()
  let cdp

  try {
    const page = await getChromePage()
    cdp = await createCdpClient(page.webSocketDebuggerUrl)
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    })

    const inspect = (expression) => cdp.evaluate(`(() => (${expression}))()`)
    const click = (selector, index = 0) => cdp.evaluate(pointerClickScript(selector, index))
    const clickHeaderIndex = (index) => click('.editor-header__right .editor-header__icon-button', index)

    const clickCenter = async (selector, index = 0) => {
      const target = await inspect(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})][${index}];
        if (!el) return { ok: false, selector: ${JSON.stringify(selector)}, index: ${index}, count: document.querySelectorAll(${JSON.stringify(selector)}).length };
        const rect = el.getBoundingClientRect();
        return { ok: true, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: el.innerText || el.textContent || '' };
      })()`)
      if (!target.ok) return target
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: target.x, y: target.y })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: target.x, y: target.y, button: 'left', buttons: 1, clickCount: 1 })
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: target.x, y: target.y, button: 'left', buttons: 0, clickCount: 1 })
      return target
    }

    const dragSelectedComponent = async (deltaX, deltaY) => {
      const before = await inspect(`(() => {
        const toolbar = document.querySelector('.component-floating-toolbar');
        const wrapper = toolbar?.closest('.component-wrapper');
        if (!wrapper) return { ok: false, reason: 'selected wrapper not found' };
        const rect = wrapper.getBoundingClientRect();
        return {
          ok: true,
          clientX: rect.left + Math.min(80, rect.width / 2),
          clientY: rect.top + Math.min(60, rect.height / 2),
          left: parseFloat(wrapper.style.left || '0'),
          top: parseFloat(wrapper.style.top || '0'),
        };
      })()`)
      assertStep(before.ok, 'Could not find selected component before dragging', before)

      await cdp.evaluate(`(() => {
        const toolbar = document.querySelector('.component-floating-toolbar');
        const wrapper = toolbar?.closest('.component-wrapper');
        if (!wrapper) return false;
        const startX = ${before.clientX};
        const startY = ${before.clientY};
        const endX = startX + ${deltaX};
        const endY = startY + ${deltaY};
        wrapper.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: startX,
          clientY: startY,
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: endX,
          clientY: endY,
        }));
        window.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          clientX: endX,
          clientY: endY,
        }));
        return true;
      })()`)
      await sleep(700)

      const after = await inspect(`(() => {
        const toolbar = document.querySelector('.component-floating-toolbar');
        const wrapper = toolbar?.closest('.component-wrapper');
        if (!wrapper) return { ok: false, reason: 'selected wrapper not found after drag' };
        return {
          ok: true,
          left: parseFloat(wrapper.style.left || '0'),
          top: parseFloat(wrapper.style.top || '0'),
        };
      })()`)

      return {
        ok: after.ok && after.left >= before.left + deltaX - 10 && after.top >= before.top + deltaY - 10,
        before,
        after,
      }
    }

    const resizeSelectedComponent = async (deltaX, deltaY) => {
      const before = await inspect(`(() => {
        const toolbar = document.querySelector('.component-floating-toolbar');
        const wrapper = toolbar?.closest('.component-wrapper');
        const handle = wrapper?.querySelector('.component-resize-handle[data-dir="se"]');
        if (!wrapper || !handle) return { ok: false, reason: 'selected wrapper or se handle not found' };
        const rect = handle.getBoundingClientRect();
        return {
          ok: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          width: parseFloat(wrapper.style.width || '0'),
          height: parseFloat(wrapper.style.height || '0'),
        };
      })()`)
      assertStep(before.ok, 'Could not find selected component resize handle', before)

      await cdp.evaluate(`(() => {
        const toolbar = document.querySelector('.component-floating-toolbar');
        const wrapper = toolbar?.closest('.component-wrapper');
        const handle = wrapper?.querySelector('.component-resize-handle[data-dir="se"]');
        if (!handle) return false;
        const startX = ${before.clientX};
        const startY = ${before.clientY};
        const endX = startX + ${deltaX};
        const endY = startY + ${deltaY};
        handle.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: startX,
          clientY: startY,
        }));
        window.dispatchEvent(new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 1,
          clientX: endX,
          clientY: endY,
        }));
        window.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          button: 0,
          buttons: 0,
          clientX: endX,
          clientY: endY,
        }));
        return true;
      })()`)
      await sleep(700)

      const after = await inspect(`(() => {
        const toolbar = document.querySelector('.component-floating-toolbar');
        const wrapper = toolbar?.closest('.component-wrapper');
        if (!wrapper) return { ok: false, reason: 'selected wrapper not found after resize' };
        return {
          ok: true,
          width: parseFloat(wrapper.style.width || '0'),
          height: parseFloat(wrapper.style.height || '0'),
        };
      })()`)

      return {
        ok: after.ok && after.width >= before.width + deltaX - 10 && after.height >= before.height + deltaY - 10,
        before,
        after,
      }
    }

    const setJsFilterCode = async () => {
      const code = `const rows = Array.isArray(res) ? res : (Array.isArray(res.data) ? res.data : [])
return {
  data: rows,
  month: rows.map(item => item.month),
  sales: rows.map(item => item.sales),
  profit: rows.map(item => item.profit),
  target: rows.map(item => item.target)
}`

      const focusResult = await cdp.evaluate(`(() => {
        const editors = [...document.querySelectorAll('.probe-output-pane .cm-content[contenteditable="true"], .probe-output-pane .cm-content')];
        const editor = editors[editors.length - 1];
        if (!editor) return { ok: false, reason: 'CodeMirror JS editor not found', body: document.body.innerText.slice(0, 1200) };
        editor.scrollIntoView({ block: 'center', inline: 'center' });
        editor.focus();
        document.execCommand('selectAll', false, null);
        return { ok: true, editorText: editor.innerText.slice(0, 200) };
      })()`)
      assertStep(focusResult.ok, 'Could not focus JS filter editor', focusResult)

      await cdp.send('Input.insertText', { text: code })
      await sleep(500)

      return inspect(`{
        ok: [...document.querySelectorAll('.probe-output-pane .cm-content')]
          .map((item) => item.innerText || item.textContent || '')
          .join('\\n')
          .includes('rows.map'),
        body: document.body.innerText.slice(0, 1200)
      }`)
    }

    const waitForSavedSchema = async () => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const task = await jsonFetch(`${SERVER_URL}/api/tasks/${taskId}`)
        const schema = task?.schema || {}
        const components = Array.isArray(schema.components) ? schema.components : []
        const globalData = schema.globalData || {}
        const types = new Set(components.map((item) => item.type))
        const metricCard = components.find((item) => item.type === 'metric-card')
        const saved = types.has('chart-bar')
          && types.has('text')
          && types.has('table')
          && types.has('metric-card')
          && Array.isArray(globalData.sales)
          && Array.isArray(globalData.profit)
          && Array.isArray(globalData.data)
          && metricCard?.position?.x >= 240
          && metricCard?.position?.y >= 200
          && metricCard?.position?.w >= 360
          && metricCard?.position?.h >= 190
        if (saved) {
          return {
            ok: true,
            components: components.length,
            types: [...types],
            fields: Object.keys(globalData),
            metricPosition: metricCard.position,
          }
        }
        await sleep(500)
      }
      const task = await jsonFetch(`${SERVER_URL}/api/tasks/${taskId}`)
      return { ok: false, schema: task?.schema }
    }

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` })
    await sleep(1000)
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/editor/${taskId}` })
    await sleep(3200)

    const initial = await inspect(`{
      hasHeader: !!document.querySelector('.editor-header'),
      hasMetricTool: [...document.querySelectorAll('.editor-header__tool')].some((item) => (item.innerText || '').includes('#')),
      hasDatasetPanel: !!document.querySelector('.fields-panel'),
      startsEmpty: !document.body.innerText.includes('sales') && !document.body.innerText.includes('profit')
    }`)
    assertStep(initial.hasHeader && initial.hasMetricTool && initial.hasDatasetPanel && initial.startsEmpty, 'Editor did not load an empty task with metric tool and dataset panel', initial)

    const manageDataset = await click('.fields-panel__header button')
    assertStep(manageDataset.ok, 'Could not open dataset manager from right panel', manageDataset)
    await sleep(700)

    const updateDataset = await click('.data-manager-actions button', 0)
    assertStep(updateDataset.ok, 'Could not open DataProbe from dataset manager', updateDataset)
    await sleep(1000)

    const sendProbe = await click('.data-probe-dialog .probe-section--input button.el-button--primary:not(.is-text)', 0)
    assertStep(sendProbe.ok, 'Could not click send probe', sendProbe)
    await sleep(1800)

    const afterProbe = await inspect(`{
      fetched: document.body.innerText.includes('month') && document.body.innerText.includes('sales'),
      hasJsEditor: document.querySelectorAll('.probe-output-pane .cm-content').length >= 2,
      hasImportButton: [...document.querySelectorAll('.probe-footer button')].some((item) => !item.disabled && item.classList.contains('el-button--primary'))
    }`)
    assertStep(afterProbe.fetched && afterProbe.hasJsEditor && afterProbe.hasImportButton, 'Remote probe did not fetch mock data into the JS cleaning UI', afterProbe)

    const filterCode = await setJsFilterCode()
    assertStep(filterCode.ok, 'Could not write JS cleaning code into DataProbe', filterCode)

    const importDataset = await click('.probe-footer button.el-button--primary', 0)
    assertStep(importDataset.ok, 'Could not validate and import JS filter result into current dataset', importDataset)
    await sleep(1400)

    const afterImport = await inspect(`{
      hasFields: document.body.innerText.includes('sales') && document.body.innerText.includes('profit'),
      hasTarget: document.body.innerText.includes('target'),
      hasTableDataset: document.body.innerText.includes('data'),
      probeClosed: ![...document.querySelectorAll('.data-probe-dialog')].some((item) => {
        const rect = item.getBoundingClientRect();
        const style = window.getComputedStyle(item);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })
    }`)
    assertStep(afterImport.hasFields && afterImport.hasTarget && afterImport.hasTableDataset && afterImport.probeClosed, 'Imported dataset did not appear in field panel', afterImport)

    const reopenManager = await click('.fields-panel__header button')
    assertStep(reopenManager.ok, 'Could not reopen dataset manager for repeat import', reopenManager)
    await sleep(700)
    const updateDatasetAgain = await click('.data-manager-actions button', 0)
    assertStep(updateDatasetAgain.ok, 'Could not reopen DataProbe for repeat import', updateDatasetAgain)
    await sleep(1000)
    const sendProbeAgain = await click('.data-probe-dialog .probe-section--input button.el-button--primary:not(.is-text)', 0)
    assertStep(sendProbeAgain.ok, 'Could not send repeat probe', sendProbeAgain)
    await sleep(1800)
    const filterCodeAgain = await setJsFilterCode()
    assertStep(filterCodeAgain.ok, 'Could not write repeat JS cleaning code into DataProbe', filterCodeAgain)
    const repeatImport = await click('.probe-footer button.el-button--primary', 0)
    assertStep(repeatImport.ok, 'Could not trigger repeat dataset import', repeatImport)
    await sleep(700)
    const overwritePrompt = await inspect(`{
      visible: [...document.querySelectorAll('.data-probe-overwrite-dialog')].some((item) => {
        const rect = item.getBoundingClientRect();
        const style = window.getComputedStyle(item);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }),
      mentionsFields: document.body.innerText.includes('sales') && document.body.innerText.includes('profit')
    }`)
    assertStep(overwritePrompt.visible && overwritePrompt.mentionsFields, 'Repeat import did not ask for overwrite confirmation', overwritePrompt)
    const confirmOverwrite = await click('.data-probe-overwrite-dialog button.el-button--primary', 0)
    assertStep(confirmOverwrite.ok, 'Could not confirm repeat import overwrite', confirmOverwrite)
    await sleep(1400)
    const afterRepeatImport = await inspect(`{
      hasFields: document.body.innerText.includes('sales') && document.body.innerText.includes('profit'),
      hasTarget: document.body.innerText.includes('target'),
      hasTableDataset: document.body.innerText.includes('data'),
      promptClosed: ![...document.querySelectorAll('.data-probe-overwrite-dialog')].some((item) => {
        const rect = item.getBoundingClientRect();
        const style = window.getComputedStyle(item);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      }),
      probeClosed: ![...document.querySelectorAll('.data-probe-dialog')].some((item) => {
        const rect = item.getBoundingClientRect();
        const style = window.getComputedStyle(item);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      })
    }`)
    assertStep(
      afterRepeatImport.hasFields
        && afterRepeatImport.hasTarget
        && afterRepeatImport.hasTableDataset
        && afterRepeatImport.promptClosed
        && afterRepeatImport.probeClosed,
      'Repeat import overwrite flow did not finish cleanly',
      afterRepeatImport,
    )

    const openChartMenu = await click('.editor-header__center .editor-header__tool', 0)
    assertStep(openChartMenu.ok, 'Could not open chart menu', openChartMenu)
    await sleep(500)
    const addBarChart = await click('.editor-chart-dropdown .el-dropdown-menu__item', 0)
    assertStep(addBarChart.ok, 'Could not add bar chart from menu', addBarChart)
    await sleep(1000)

    const addText = await click('.editor-header__center .editor-header__tool', 1)
    assertStep(addText.ok, 'Could not click text tool', addText)
    await sleep(500)

    const addTable = await click('.editor-header__center .editor-header__tool', 2)
    assertStep(addTable.ok, 'Could not click table tool', addTable)
    await sleep(800)

    const addMetric = await click('.editor-header__center .editor-header__tool', 3)
    assertStep(addMetric.ok, 'Could not click metric card tool', addMetric)
    await sleep(900)

    const afterComponents = await inspect(`{
      componentCount: document.querySelectorAll('.component-wrapper').length,
      hasChartCanvas: document.querySelectorAll('.component-wrapper canvas').length >= 1,
      hasTableRows: document.body.innerText.includes('1月') && document.body.innerText.includes('2月'),
      hasMetricComponent: !!document.querySelector('.lb-metric-card'),
      showsValue: document.body.innerText.includes('150'),
      selectedComponent: !!document.querySelector('.component-floating-toolbar'),
      saveStatusVisible: !!document.querySelector('.editor-header__save-tag')
    }`)
    assertStep(
      afterComponents.componentCount >= 4
        && afterComponents.hasChartCanvas
        && afterComponents.hasTableRows
        && afterComponents.hasMetricComponent
        && afterComponents.showsValue
        && afterComponents.selectedComponent
        && afterComponents.saveStatusVisible,
      'Chart/text/table/metric components did not render/configure correctly',
      afterComponents,
    )

    const afterDrag = await dragSelectedComponent(64, 36)
    assertStep(afterDrag.ok, 'Canvas drag editing did not update selected component position', afterDrag)

    const afterResize = await resizeSelectedComponent(72, 42)
    assertStep(afterResize.ok, 'Canvas resize editing did not update selected component size', afterResize)

    const save = await clickHeaderIndex(2)
    assertStep(save.ok, 'Could not click save button', save)
    await sleep(1400)
    const afterSave = await waitForSavedSchema()
    assertStep(afterSave.ok, 'Save did not persist dataset and metric card schema', afterSave)

    await cdp.send('Page.reload', { ignoreCache: true })
    await sleep(3000)
    const afterReload = await inspect(`{
      componentCount: document.querySelectorAll('.component-wrapper').length,
      hasChartCanvas: document.querySelectorAll('.component-wrapper canvas').length >= 1,
      hasTableRows: document.body.innerText.includes('1月') && document.body.innerText.includes('2月'),
      hasMetricComponent: !!document.querySelector('.lb-metric-card'),
      showsValue: document.body.innerText.includes('150'),
      hasFields: document.body.innerText.includes('sales') && document.body.innerText.includes('profit')
    }`)
    assertStep(
      afterReload.componentCount >= 4
        && afterReload.hasChartCanvas
        && afterReload.hasTableRows
        && afterReload.hasMetricComponent
        && afterReload.showsValue
        && afterReload.hasFields,
      'Saved components did not restore after reload',
      afterReload,
    )

    const preview = await clickHeaderIndex(1)
    assertStep(preview.ok, 'Could not click preview button', preview)
    await sleep(1200)
    const afterPreview = await inspect(`{
      noHeader: !document.querySelector('.editor-header'),
      noPanel: !document.querySelector('.editor-panel--right'),
      hasExit: !!document.querySelector('.preview-exit-button'),
      componentCount: document.querySelectorAll('.component-wrapper').length,
      hasChartCanvas: document.querySelectorAll('.component-wrapper canvas').length >= 1,
      hasTableRows: document.body.innerText.includes('1月') && document.body.innerText.includes('2月'),
      hasMetricComponent: !!document.querySelector('.lb-metric-card'),
      showsValue: document.body.innerText.includes('150')
    }`)
    assertStep(
      afterPreview.noHeader
        && afterPreview.noPanel
        && afterPreview.hasExit
        && afterPreview.componentCount >= 4
        && afterPreview.hasChartCanvas
        && afterPreview.hasTableRows
        && afterPreview.hasMetricComponent
        && afterPreview.showsValue,
      'Clean preview mode failed',
      afterPreview,
    )

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/editor/${taskId}` })
    await sleep(2500)
    const exportClick = await clickHeaderIndex(3)
    assertStep(exportClick.ok, 'Could not click export button', exportClick)
    await sleep(1000)
    const exportState = await inspect(`(() => {
      const textarea = document.querySelector('.export-dialog-code textarea, textarea');
      const code = textarea?.value || '';
      return {
        code,
        hasDialog: !!document.querySelector('.el-dialog'),
        hasChartInCode: code.includes('<v-chart') && code.includes('chartOption_'),
        hasTextInCode: code.includes('lb-text'),
        hasTableInCode: code.includes('lb-table'),
        hasMetricInCode: code.includes('lb-metric-card') && code.includes('metric_'),
        hasGlobalData: code.includes('globalData') && code.includes('sales') && code.includes('data'),
        hasValueField: code.includes('sales'),
      };
    })()`)
    const exportedVueCompile = validateExportedVueCode(exportState.code || '')
    const exportCheck = { ...exportState, code: undefined, codeLength: (exportState.code || '').length }
    assertStep(
      exportCheck.hasDialog
        && exportCheck.hasChartInCode
        && exportCheck.hasTextInCode
        && exportCheck.hasTableInCode
        && exportCheck.hasMetricInCode
        && exportCheck.hasGlobalData
        && exportCheck.hasValueField
        && exportedVueCompile.ok,
      'Export code does not contain chart/text/table/metric/data or is not a valid Vue SFC',
      { exportCheck, exportedVueCompile },
    )

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/editor/${taskId}?preview=1` })
    await sleep(2500)
    const directPreview = await inspect(`{
      noHeader: !document.querySelector('.editor-header'),
      noPanel: !document.querySelector('.editor-panel--right'),
      hasExit: !!document.querySelector('.preview-exit-button'),
      componentCount: document.querySelectorAll('.component-wrapper').length,
      hasChartCanvas: document.querySelectorAll('.component-wrapper canvas').length >= 1,
      hasTableRows: document.body.innerText.includes('1月') && document.body.innerText.includes('2月'),
      hasMetricComponent: !!document.querySelector('.lb-metric-card'),
      showsValue: document.body.innerText.includes('150')
    }`)
    assertStep(
      directPreview.noHeader
        && directPreview.noPanel
        && directPreview.hasExit
        && directPreview.componentCount >= 4
        && directPreview.hasChartCanvas
        && directPreview.hasTableRows
        && directPreview.hasMetricComponent
        && directPreview.showsValue,
      'Direct preview URL failed',
      directPreview,
    )

    console.log(JSON.stringify({
      ok: true,
      taskId,
      checks: {
        initial,
        afterProbe,
        filterCode,
        afterImport,
        afterRepeatImport,
        afterComponents,
        afterDrag,
        afterResize,
        afterSave,
        afterReload,
        afterPreview,
        exportCheck,
        exportedVueCompile,
        directPreview,
      },
    }, null, 2))
  } finally {
    cdp?.close()
    await fetch(`${SERVER_URL}/api/tasks/${taskId}`, { method: 'DELETE' }).catch(() => {})
  }
}

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
