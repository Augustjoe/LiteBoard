import { defineComponent, computed } from 'vue'
import { useEditorStore } from '../stores/editorStore'

export default defineComponent({
  name: 'ChartRenderer',
  setup() {
    const store = useEditorStore()

    /** 核心 computed：根据 store 中的 rawData 和 chartSchema 动态组装 ECharts option */
    const chartOption = computed(() => {
      const { rawData, chartSchema } = store
      const { xAxisField, yAxisField, chartType } = chartSchema

      // 未配置必要字段时返回 null
      if (!xAxisField || !yAxisField || rawData.length === 0) {
        return null
      }

      return {
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
          data: (rawData as Record<string, unknown>[]).map((item) => String(item[xAxisField] ?? '')),
          axisLabel: {
            rotate: rawData.length > 8 ? 30 : 0,
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
            data: (rawData as Record<string, unknown>[]).map((item) => {
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
    })

    return () => (
      <div class="chart-renderer" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {chartOption.value ? (
          <v-chart
            option={chartOption.value}
            style={{ width: '100%', height: '100%' }}
            autoresize
          />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: '8px',
          }}>
            {store.hasData ? (
              <>
                <el-empty description="请在右侧面板配置图表 X/Y 轴字段" />
                <div style={{ fontSize: '12px', color: '#909399' }}>
                  可用字段：{store.availableFields.join(', ') || '—'}
                </div>
              </>
            ) : (
              <el-empty description="暂无数据 — 请先在左侧探针面板获取数据" />
            )}
          </div>
        )}
      </div>
    )
  },
})
