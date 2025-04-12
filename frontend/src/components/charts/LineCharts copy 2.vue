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
const markerSeriesIndex = ref(-1);

// 获取声部显示名称
const getVoiceName = (voiceKey) => {
  if (window.voiceFileNames?.[voiceKey]) {
    const fullName = window.voiceFileNames[voiceKey].split(/[\\/]/).pop();
    return fullName.length > 20 ? `${fullName.substring(0, 17)}...` : fullName;
  }
  return `声部${voiceKey.replace("voice", "")}`;
};

const generateSeries = () => {
  // 生成声部系列
  const voices = new Set();
  props.data.forEach((point) => {
    Object.keys(point).forEach((key) => {
      if (key.startsWith("voice")) voices.add(key);
    });
  });

  const series = Array.from(voices).map((voiceKey, index) => ({
    name: getVoiceName(voiceKey),
    type: "line",
    smooth: true,
    data: props.data.map((point) => point[voiceKey] || null),
    itemStyle: { color: COLOR_PALETTE[index % COLOR_PALETTE.length] },
    symbol: "circle",
    symbolSize: 4,
    showSymbol: props.data.length < 50,
  }));

  // 修改标记线系列配置
  series.push({
    name: "CURRENT_TIME_MARKER",
    type: "line",
    data: props.data.map(d => ({ 
      name: d.xData,
      value: [d.xData, 2000] // 使用实际xData值定位
    })),
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: { color: "#FF2222", width: 2 },
      label: {
        show: true,
        position: 'end',
        formatter: () => {
          const point = props.data.find(d => d.xData === props.currentTime);
          return point ? Object.keys(point)
            .filter(k => k.startsWith('voice'))
            .map(k => frequencyToNote(point[k]))
            .join(' / ') : "--";
        }
      },
      data: [{ xAxis: props.currentTime }] // 使用数值坐标定位
    }
  });
  
  markerSeriesIndex.value = series.length - 1;
  return series;
};


// 更新图表数据
const updateChart = () => {
  if (!myChart) return;

  const option = {
    xAxis: {
      type: "value", // 关键修改：改为数值轴
      name: "时间 (秒)",
      min: Math.min(...props.data.map(d => d.xData)),
      max: Math.max(...props.data.map(d => d.xData)),
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
    series: generateSeries(),
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
    replaceMerge: ["series", "xAxis", "yAxis", "dataZoom"],
  });
};

// ======================= 时间监听 =======================
watch(
  () => props.currentTime,
  (newTime) => {
    if (!myChart || markerSeriesIndex.value === -1) return;

    // 确保时间在数据范围内
    const xMin = Math.min(...props.data.map(d => d.xData));
    const xMax = Math.max(...props.data.map(d => d.xData));
    const validTime = Math.max(xMin, Math.min(newTime, xMax));

    // 更新标记线位置
    myChart.setOption({
      series: [{
        markLine: { 
          data: [{ xAxis: validTime }],
          label: { // 动态更新标签内容
            formatter: () => {
              const point = props.data.find(d => d.xData === validTime);
              return point ? Object.keys(point)
                .filter(k => k.startsWith('voice'))
                .map(k => frequencyToNote(point[k]))
                .join(' / ') : "--";
            }
          }
        }
      }]
    }, { seriesIndex: [markerSeriesIndex.value] });

    // 自动滚动逻辑（添加平滑过渡）
    const dataZoom = myChart.getModel().getOption().dataZoom[0];
    const visibleRange = 30; // 可视窗口范围（秒）
    
    // 计算理想显示范围
    const targetStart = Math.max(xMin, validTime - visibleRange/2);
    const targetEnd = Math.min(xMax, validTime + visibleRange/2);
    
    // 转换为百分比
    const totalRange = xMax - xMin;
    const newStart = ((targetStart - xMin) / totalRange) * 100;
    const newEnd = ((targetEnd - xMin) / totalRange) * 100;

    // 平滑过渡
    myChart.setOption({
      dataZoom: [{
        start: newStart,
        end: newEnd
      }, {
        start: newStart,
        end: newEnd
      }]
    });
  }
);
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
  });
  updateChart();
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
