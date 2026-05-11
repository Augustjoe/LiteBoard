import fs from 'node:fs';
import path from 'node:path';

// 使用 process.cwd() 获取当前工作目录（脚本从项目根运行）
const __dirname = process.cwd();

// 1. 文件读取与解析
const schemaPath = path.join(__dirname, 'mock/schema.json');
const schemaContent: string = fs.readFileSync(schemaPath, 'utf-8');
const schema = JSON.parse(schemaContent) as {
    pageConfig: { name: string };
    dataSource: { id: string; url: string; method: string };
    component: {
        props: { title: string; chartType: string };
        dataMapping: { xField: string; yField: string };
    };
};

// 提取配置
const pageName: string = schema.pageConfig.name;
const dataSource = schema.dataSource;
const component = schema.component;

// 辅助函数：生成数据获取逻辑 (fetch)
function generateFetchLogic(dataSourceId: string, url: string, method: string): string {
    return `
const ${dataSourceId}_data = ref([]);

onMounted(async () => {
  try {
    const response = await fetch('${url}', {
      method: '${method}'
    });
    const resData = await response.json();
    // 截取前10条用于图表展示演示
    ${dataSourceId}_data.value = resData.slice(0, 10); 
  } catch (error) {
    console.error('API请求失败:', error);
  }
});
`;
}

// 辅助函数：生成图表配置计算属性 (computed)
function generateChartOption(
    comp: {
        props: { title: string; chartType: string };
        dataMapping: { xField: string; yField: string };
    },
    dataSourceId: string
): string {
    const title = comp.props.title;
    const chartType = comp.props.chartType;
    const xField = comp.dataMapping.xField;
    const yField = comp.dataMapping.yField;

    return `
const chartOption = computed(() => {
  return {
    title: { 
      text: '${title}' 
    },
    xAxis: {
      type: 'category',
      data: ${dataSourceId}_data.value.map((item: Record<string, unknown>) => item['${xField}'])
    },
    yAxis: { 
      type: 'value' 
    },
    series: [
      {
        type: '${chartType}',
        data: ${dataSourceId}_data.value.map((item: Record<string, unknown>) => item['${yField}'])
      }
    ]
  };
});
`;
}

// 3. 组装Vue 3 SFC模板字符串
const vueSFCContent = `
<template>
  <div class="dashboard-container" style="padding: 20px;">
    <v-chart class="chart" :option="chartOption" style="height: 400px; width: 100%;" />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import VChart from 'vue-echarts';

// 1. 定义状态 (响应式数据)
${generateFetchLogic(dataSource.id, dataSource.url, dataSource.method)}

// 2. 数据获取逻辑 (onMounted)

// 3. 图表配置计算属性 (动态映射)
${generateChartOption(component, dataSource.id)}
</script>
`;

// 4. 文件写入
const outputFileName = `${pageName}.vue`;
fs.writeFileSync(outputFileName, vueSFCContent, 'utf-8');

console.log(`成功生成 ${outputFileName}`);
