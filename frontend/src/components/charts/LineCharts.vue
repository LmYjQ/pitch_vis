<template>
  <div :id="id" ref="lineChartRef" :style="{ height: height, width: width }" />
</template>
<script setup>
import { defineOptions, onMounted, nextTick, watch, onBeforeUnmount } from "vue";
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
  if (!myChart) return;
  // 提取所有声部名称
  const voiceNames = [];
  props.data.forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (key.startsWith("voice") && !voiceNames.includes(key)) {
        voiceNames.push(key);
      }
    });
  });
  // 按声部分组数据
  const seriesData = voiceNames.map((voiceName) => {
    return {
      name: `声部${voiceName}音高`,
      type: "line",
      smooth: true,
      data: props.data.map((item) => item[voiceName] || null), // 如果声部不存在，设为 null
      itemStyle: {
        color: "#5470C6",
      },

      // connectNulls: true, // 连接空值点
    };
  });

  const option = {
    tooltip: {
      trigger: "axis",
      formatter: function (params) {
        let tooltipText = "";
        params.forEach((param) => {
          const { seriesIndex, value } = param;
          tooltipText += `声部${seriesIndex + 1}: 频率 ${value.toFixed(
            1
          )} Hz; 音高 ${frequencyToNote(value)}\n`;
        });
        return tooltipText;
      },
    },
    grid: {
      left: "5%",
      right: "5%",
      bottom: "10%",
      containLabel: true,
    },

    dataZoom: [
      {
        type: "inside",
        start: 0,
        end: 100,
      },
      {
        show: true,
        type: "slider",
        y: "90%",
        start: 0,
        end: 100,
      },
    ],

    xAxis: {
      type: "category",
      data: props.data.map((v) => v.xData),
      name: "时间",
    },
    yAxis: [
      {
        type: "log",
        scale: true,
        name: "频率 (Hz)",
        min: 50, // 最低频率设为50Hz，约等于G1音
        max: 2000, // 最高频率设为2000Hz，约等于B6音
        position: "left",
        logBase: 2, // 以2为底的对数，符合音乐中八度的关系
        axisLine: {
          lineStyle: {
            color: "#1982ff",
            width: 1, //这里是为了突出显示加上的
          },
        },
        axisLabel: {
          //字体颜色
          show: true,

          formatter: "{value} Hz",
        },
        splitLine: {
          show: true,
          lineStyle: {
            type: "dashed",
          },
        },
        boundaryGap: [0.2, 0.2],
      },
    ],
    series: seriesData, // 动态生成 series
  };
  myChart.setOption(option, { notMerge: true });
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
  }
}

watch(
  () => props.data,
  () => {
    nextTick(() => {
      updateChart();
    });
  },
  { deep: true }
);

// 生成音高刻度
// function generateNoteScale() {
//   // 生成从C2到C7的音符刻度
//   const notes = []
//   const baseNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

//   for (let octave = 2; octave <= 7; octave++) {
//     for (let i = 0; i < baseNotes.length; i++) {
//       notes.push(`${baseNotes[i]}${octave}`)
//     }
//   }

//   return notes
// }

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
