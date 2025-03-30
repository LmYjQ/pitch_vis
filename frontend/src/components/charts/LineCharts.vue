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
// const maxPoints = 100;
let myChart = null;
// 在setup作用域顶部定义voiceNames引用
const voiceNames = ref([]);
const currentNotes = ref({}); // 用于存储当前音高
// ======================= 时间监听优化 =======================
watch(
  () => props.currentTime,
  (newTime) => {
    const closestPoint = props.data.find((point) => Math.abs(point.xData - newTime) < 0.1);

    currentNotes.value = Object.keys(closestPoint || {})
      .filter((key) => key.startsWith("voice"))
      .reduce((notes, key) => {
        notes[key] = frequencyToNote(closestPoint[key]);
        return notes;
      }, {});

    if (!myChart) return;

    // 仅更新标记线位置
    myChart.setOption(
      {
        series: [
          {
            name: "CURRENT_TIME_MARKER",
            markLine: { data: [{ xAxis: newTime }] },
          },
        ],
      },
      {
        seriesIndex: [voiceNames.value.length], // 标记线是最后一个系列
        notMerge: false,
        lazyUpdate: true,
      }
    );

    // 自动滚动到当前时间区域
    if (myChart.getOption().dataZoom?.[1]) {
      const timeRange = Math.max(...props.data.map((item) => item.xData)) || 1;
      const lookAhead = 10; // 前瞻时间(秒)

      // 计算可见区域
      const visibleStart = Math.max(0, newTime - lookAhead);
      const visibleEnd = Math.min(timeRange, newTime + lookAhead);

      // 计算百分比时添加容错
      const safeTimeRange = timeRange > 0 ? timeRange : 1;
      const startPercent = (visibleStart / safeTimeRange) * 100;
      const endPercent = (visibleEnd / safeTimeRange) * 100;

      myChart.dispatchAction({
        type: "dataZoom",
        dataZoomIndex: 1, // 对应slider类型的dataZoom
        start: startPercent,
        end: endPercent,
      });
    }
  }
);
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

  // ======================= 数据预处理 =======================
  // 提取所有声部名称（voice1, voice2...）
  voiceNames.value = [
    ...new Set(
      props.data.flatMap((item) => Object.keys(item).filter((key) => key.startsWith("voice")))
    ),
  ];
  console.log("检测到的声部:", voiceNames.value);

  // ======================= 颜色配置 =======================
  const colorPalette = [
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

  // ======================= 构建声部系列 =======================
  const voiceSeries = voiceNames.value.map((voiceKey, index) => {
    // 处理文件名显示
    let seriesName = `声部${voiceKey.replace("voice", "")}`;
    if (window.voiceFileNames?.[voiceKey]) {
      const fullName = window.voiceFileNames[voiceKey];
      const fileName = fullName.split(/[\\/]/).pop(); // 跨平台路径处理
      seriesName = fileName.length > 20 ? `${fileName.substring(0, 17)}...` : fileName;
    }

    // 构建数据点（过滤无效值）
    const validData = props.data
      .filter((item) => item[voiceKey] > 0)
      .map((item) => [item.xData, item[voiceKey]]);

    return {
      name: seriesName,
      type: "line",
      smooth: true,
      data: validData,
      itemStyle: { color: colorPalette[index % colorPalette.length] },
      symbol: "none", // 隐藏数据点符号
      connectNulls: false,
    };
  });

  // ======================= 时间标记线系列 =======================
  const timeMarkerSeries = {
    name: "CURRENT_TIME_MARKER",
    type: "line",
    data: [],
    markLine: {
      silent: true,
      symbol: "none",
      lineStyle: {
        color: "#FF2222",
        width: 2,
        type: "solid",
      },
      data: [
        {
          xAxis: props.currentTime,
          yAxis: "min", // 纵向贯穿整个图表
        },
      ],
      label: {
        show: true,
        formatter: () => Object.values(currentNotes.value).join(" / ") || "--",
      },
      animation: false, // 禁用动画避免延迟
    },
  };

  // ======================= 合并所有系列 =======================
  const allSeries = [...voiceSeries, timeMarkerSeries];

  // ======================= 构建完整配置 =======================
  const option = {
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const validParams = params.filter(
          (p) => p.seriesName !== "CURRENT_TIME_MARKER" && p.data?.[1] !== undefined
        );

        if (validParams.length === 0) return "无有效数据";

        return validParams
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
            <span>
              ${p.seriesName}:
              ${p.data[1].toFixed(1)} Hz
              (${frequencyToNote(p.data[1])})
            </span>
          </div>
        `
          )
          .join("");
      },
    },
    xAxis: {
      type: "value",
      name: "时间 (秒)",
      axisLabel: {
        formatter: (value) => (value % 1 === 0 ? `${value}s` : `${value.toFixed(1)}s`),
      },
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
    grid: {
      left: "6%",
      right: "4%",
      bottom: "14%",
      containLabel: true,
    },
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
    series: allSeries,
  };

  // ======================= 应用配置 =======================
  try {
    // 智能合并配置（保留动画状态）
    myChart.setOption(option, {
      notMerge: false,
      replaceMerge: ["series"], // 完全替换系列数组
      lazyUpdate: true, // 提升性能
    });

    // 强制重渲染标记线
    myChart.dispatchAction({
      type: "markLine",
      seriesIndex: allSeries.length - 1, // 最后一个是标记线系列
      data: [{ xAxis: props.currentTime }],
    });

    console.log("图表更新成功，当前时间:", props.currentTime);
  } catch (error) {
    console.error("图表更新失败:", error);
  }
}

// 保持数组长度不超过最大点数
//   if (pitchData.value.length > maxPoints) {
//     pitchData.value.shift()
//     noteData.value.shift()
//   }

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
    });
  },
  { deep: true }
);

onMounted(() => {
  console.log("LineCharts - 组件已挂载");
  nextTick(() => {
    console.log("LineCharts - 初始化图表");
    initChart();
    window.addEventListener("resize", changeChartSize);
  });
});

onBeforeUnmount(() => {
  console.log("LineCharts - 组件即将卸载");
  if (myChart) {
    myChart.dispose();
    myChart = null;
    console.log("LineCharts - 图表实例已销毁");
  }
  window.removeEventListener("resize", changeChartSize);
});
</script>
<style lang="scss" scoped></style>
