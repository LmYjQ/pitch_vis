<template>
  <div :id="id" ref="DynamicsLineRef" :style="{ height: height, width: width }" />
</template>
<script setup>
import { ref, defineOptions, onMounted, nextTick, watch, onBeforeUnmount } from "vue";
import * as echarts from "echarts";
import { frequencyToNote } from "@/utils/common";
defineOptions({ name: "DynamicsLineCharts" });
const props = defineProps({
  id: {
    type: String,
    default: "DynamicsLineId",
  },
  width: {
    type: String,
    default: "100%",
  },
  height: {
    type: String,
    default: "70%",
  },
  currentTime: {
    type: Number,
    default: 0,
  },
  data: {
    type: Array,
    required: true,
    default: () => [],
  },
  /* 数据实例
  data:[
    { xData: 1, voice1: 400, voice2: 500 },
    { xData: 2, voice1: 400, voice2: 500, voice3: 600 },
    { xData: 3, voice1: 450, voice3: 550 }
  ]
*/
});
const MAX_POINTS = 50;
// ======================= 颜色配置 =======================
const COLOR_PALETTE = [
  "#5470C6",
  "#91CC75",
  "#FAC858",
  "#EE6666",
  "#73C0DE",
  "#3BA272",
  "#FC8452",
  "#9A60B4",
  "#ea7ccc",
  "#4cabce",
  "#a5e7f0",
  "#45b97c",
];
let myChart = null;
const displayedData = ref([]);
// 获取声部显示名称
const getVoiceName = (voiceKey) => {
  if (window.voiceFileNames?.[voiceKey]) {
    const fullName = window.voiceFileNames[voiceKey].split(/[\\/]/).pop();
    return fullName.length > 20 ? `${fullName.substring(0, 17)}...` : fullName;
  }
  return `声部${voiceKey.replace("voice", "")}`;
};

const generateSeries = (data) => {
  const voices = new Set();
  data.forEach((point) => {
    Object.keys(point).forEach((key) => {
      if (key.startsWith("voice")) voices.add(key);
    });
  });

  return Array.from(voices).map((voiceKey, index) => ({
    name: getVoiceName(voiceKey),
    type: "line",
    smooth: true,
    data: data.map((point) => point[voiceKey] || null),
    itemStyle: { color: COLOR_PALETTE[index % COLOR_PALETTE.length] },
    symbol: "circle",
    symbolSize: 4,
    connectNulls: false,
    showSymbol: data.length < 50,
  }));
};
// 初始化ECharts
function initChart() {
  const chartDom = document.getElementById(props.id);
  if (!chartDom) return;

  myChart = echarts.getInstanceByDom(chartDom);
  if (!myChart) {
    myChart = echarts.init(chartDom);
  }

  updateChart();
}
// 更新图表数据
function updateChart() {
  if (!myChart) {
    console.error("图表实例不存在，无法更新图表");
    return;
  }
  // 截断数据并保留两位小数
  displayedData.value = props.data.slice(-MAX_POINTS).map((item) => ({
    ...item,
    xData: Number(item.xData.toFixed(2)),
  }));
  // ======================= 构建完整配置 =======================
  const option = {
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        return params
          .map(
            (p) => `
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="
              display: inline-block;
              width: 10px;
              height: 10px;
              border-radius: 50%;
              background: ${p.color};
            "></span>
               <span>${p.seriesName}: ${p.value}Hz (${frequencyToNote(p.value)})</span>
          </div>
        `
          )
          .join("");
      },
    },
    xAxis: {
      type: "category",
      data: displayedData.value.map((d) => d.xData.toFixed(2)),
      name: "时间 (秒)",
    },
    yAxis: {
      type: "log",
      name: "音高",
      min: 50,
      max: 2000,
      logBase: 2,
      axisLabel: {
        formatter: (value) => {
          return frequencyToNote(value);
        },
      },
      splitLine: { show: true, lineStyle: { type: "dashed" } },
    },
    grid: {
      left: "6%",
      right: "4%",
      bottom: "14%",
      containLabel: true,
    },
    dataZoom: [
      {
        type: "inside",
        start: Math.max(
          0,
          ((displayedData.value.length - MAX_POINTS) / displayedData.value.length) * 100
        ),
        end: 100,
        zoomLock: true,
      },
      {
        show: true,
        type: "slider",
        height: 20,
        bottom: 25,
        start: Math.max(
          0,
          ((displayedData.value.length - MAX_POINTS) / displayedData.value.length) * 100
        ),
        end: 100,
      },
    ],
    series: generateSeries(displayedData.value),
  };

  myChart.setOption(option, {
    notMerge: true,
    replaceMerge: ["series"], // 完全替换系列数组
    lazyUpdate: true, // 提升性能
  });
}

// 调整图表大小
function changeChartSize() {
  if (myChart) {
    myChart.resize();
    console.log("LineCharts - 图表大小已调整");
  }
}

watch(
  () => props.data,
  (newData, oldData) => {
    console.log(
      `LineCharts - 数据变化检测: 新数据长度=${newData.length}, 旧数据长度=${
        oldData ? oldData.length : 0
      }`
    );
    nextTick(() => {
      updateChart();
      // 自动滚动到最新数据
      myChart?.dispatchAction({
        type: "dataZoom",
        start: Math.max(
          0,
          ((displayedData.value.length - MAX_POINTS) / displayedData.value.length) * 100
        ),
        end: 100,
      });
    });
  },
  { deep: true }
);

onMounted(() => {
  nextTick(() => {
    initChart();
    window.addEventListener("resize", changeChartSize);
  });
});

onBeforeUnmount(() => {
  if (myChart) {
    myChart.dispose();
    myChart = null;
  }
  window.removeEventListener("resize", changeChartSize);
});
</script>
<style lang="scss" scoped></style>
