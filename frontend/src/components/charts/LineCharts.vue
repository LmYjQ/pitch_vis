<template>
  <div :id="id" ref="lineChartRef" :style="{ height: height, width: width }" />
</template>
<script setup>
import { ref, defineOptions, onMounted, nextTick, watch, onBeforeUnmount } from "vue";
import * as echarts from "echarts";
import { frequencyToNote } from "@/utils/common";
defineOptions({ name: "LineCharts" });
const props = defineProps({
  id: {
    type: String,
    default: "lineChartId",
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

// const MAX_POINTS = 100;
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
const lineChartRef = ref(null);

// 获取声部显示名称
const getVoiceName = (voiceKey) => {
  if (window.voiceFileNames?.[voiceKey]) {
    const fullName = window.voiceFileNames[voiceKey].split(/[\\/]/).pop();
    return fullName.length > 20 ? `${fullName.substring(0, 17)}...` : fullName;
  }
  return `声部${voiceKey.replace("voice", "")}`;
};

const generateSeries = () => {
  // 获取所有存在的声部key
  const voices = new Set();
  props.data.forEach((point) => {
    Object.keys(point).forEach((key) => {
      if (key.startsWith("voice")) voices.add(key);
    });
  });

  return Array.from(voices).map((voiceKey, index) => {
    return {
      name: getVoiceName(voiceKey),
      type: "line",
      smooth: true, // 现在可以生效
      data: props.data.map((point) => point[voiceKey] || null), // 用null处理数据缺失
      itemStyle: { color: COLOR_PALETTE[index % COLOR_PALETTE.length] },
      symbol: "circle",
      symbolSize: 4,
      connectNulls: false, // 根据需求调整是否连接空数据
      showSymbol: props.data.length < 50, // 数据点多时隐藏符号
    };
  });
};

// 时间标记线系列配置
// const getTimeMarkerSeries = () => ({
//   name: "CURRENT_TIME_MARKER",
//   type: "line",
//   markLine: {
//     silent: true,
//     symbol: "none",
//     lineStyle: { color: "#FF2222", width: 2 },
//     data: [{ xAxis: props.currentTime }],
//     label: {
//       show: true,
//       formatter: () => Object.values(chartData.value.currentNotes).join(" / ") || "--",
//     },
//   },
// });

// 更新图表数据
const updateChart = () => {
  if (!myChart) return;

  const option = {
    xAxis: {
      type: "category",
      data: props.data.map((d) => d.xData), // 直接使用原始数据
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
    },
    series: [...generateSeries()],
    dataZoom: [
      {
        type: "inside",
        start: 0,
        end: 100,
        zoomLock: true, // 防止过度缩放
      },
      {
        show: true,
        type: "slider",
        height: 20,
        bottom: 25,
        start: 0,
        end: 100,
      },
    ],
  };

  myChart.setOption(option, {
    replaceMerge: ["series", "xAxis", "dataZoom"],
    notMerge: false,
  });
};

// ======================= 时间监听 =======================
// watch(
//   () => props.currentTime,
//   (newTime) => {
//     const closestPoint = props.data.reduce((prev, curr) =>
//       Math.abs(curr.xData - newTime) < Math.abs(prev.xData - newTime) ? curr : prev
//     );

//     chartData.value.currentNotes = Object.entries(closestPoint || {})
//       .filter(([key]) => key.startsWith("voice"))
//       .reduce((notes, [key, value]) => {
//         notes[key] = frequencyToNote(value);
//         return notes;
//       }, {});

//     if (myChart) {
//       myChart.setOption(
//         {
//           series: [
//             {
//               name: "CURRENT_TIME_MARKER",
//               markLine: { data: [{ xAxis: newTime }] },
//             },
//           ],
//         },
//         { seriesIndex: [chartData.value.voiceData.size] }
//       );
//     }
//   }
// );
// 数据监听（节流处理）
watch(
  () => props.data,
  () => {
    nextTick(() => {
      updateChart();
    });
  },
  { deep: true }
);

// 初始化ECharts// 图表初始化
const initChart = () => {
  const chartDom = document.getElementById(props.id);
  if (!chartDom) return;
  myChart = echarts.getInstanceByDom(chartDom);
  console.log(echarts.init(chartDom));
  if (!myChart) {
    myChart = echarts.init(chartDom);
  }
  myChart.setOption({
    tooltip: {
      trigger: "axis",
      formatter: (params) =>
        params
          .filter((p) => p.seriesName !== "CURRENT_TIME_MARKER")
          .map(
            (p) => `
          <div style="display:flex;align-items:center;gap:6px;">
            <span style="
              display:inline-block;
              width:10px;
              height:10px;
              border-radius:50%;
              background:${p.color};
            "></span>
            <span>${p.seriesName}: ${p.value}Hz (${frequencyToNote(p.value)})</span>
          </div>
        `
          )
          .join(""),
    },
    xAxis: {
      type: "value",
      name: "时间 (秒)",

      min: (value) => Math.floor(value.min), // 动态最小值
      max: Math.max(...props.data.map((item) => item.xData)), // 动态最大值
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
  });
};

// 调整图表大小
function changeChartSize() {
  if (myChart) {
    myChart.resize();
    console.log("LineCharts - 图表大小已调整");
  }
}

onMounted(() => {
  nextTick(() => {
    initChart();
    window.addEventListener("resize", changeChartSize);
  });
});

onBeforeUnmount(() => {
  myChart?.dispose();
  window.removeEventListener("resize", changeChartSize);
});
</script>
<style lang="scss" scoped></style>
