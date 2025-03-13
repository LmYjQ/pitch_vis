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
  if (!myChart) {
    console.error("图表实例不存在，无法更新图表");
    return;
  }
  
  console.log("LineCharts - 开始更新图表，接收到的数据:", props.data);
  
  // 提取所有声部名称
  const voiceNames = [];
  props.data.forEach((item) => {
    Object.keys(item).forEach((key) => {
      if (key.startsWith("voice") && !voiceNames.includes(key)) {
        voiceNames.push(key);
      }
    });
  });
  
  console.log("LineCharts - 检测到的声部:", voiceNames);
  
  // 按声部分组数据
  const seriesData = voiceNames.map((voiceName) => {
    const voiceData = props.data.map((item) => item[voiceName] || null);
    console.log(`LineCharts - 声部${voiceName}数据:`, voiceData);
    
    return {
      name: `声部${voiceName}音高`,
      type: "line",
      smooth: true,
      data: voiceData, // 如果声部不存在，设为 null
      itemStyle: {
        color: "#5470C6",
      },

      // connectNulls: true, // 连接空值点
    };
  });

  const xAxisData = props.data.map((v) => v.xData);
  console.log("LineCharts - X轴数据:", xAxisData);

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
      data: xAxisData,
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
  
  console.log("LineCharts - 设置图表选项:", JSON.stringify(option, null, 2));
  
  try {
    myChart.setOption(option, { notMerge: true });
    console.log("LineCharts - 图表选项设置成功");
  } catch (error) {
    console.error("LineCharts - 设置图表选项时出错:", error);
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
    console.log(`LineCharts - 数据变化检测: 新数据长度=${newData.length}, 旧数据长度=${oldData ? oldData.length : 0}`);
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
