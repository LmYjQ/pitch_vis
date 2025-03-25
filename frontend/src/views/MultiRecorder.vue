<template>
  <div>
    <h2>选择监控设备：</h2>
    <div v-for="device in devices" :key="device.deviceId">
      <label>
        <input type="checkbox" v-model="selectedDevices" :value="device.deviceId" />
        {{ device.label }} - {{ statusText(getDeviceStatus(device.deviceId)) }}
      </label>
      <div v-if="activeProcessors.get(device.deviceId)?.pitches">
        实时音高：
        <div ref="chart" class="chart-container"></div>
        
      </div>
    </div>

    <button @click="startAllProcessors">开始全部监控</button>
    <button @click="stopAllProcessors">停止全部监控</button>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount } from "vue";
import aubioModule from "aubiojs";
import * as echarts from "echarts";

const devices = ref([]);
const selectedDevices = ref([]);
const activeProcessors = reactive(new Map());
const charts = reactive(new Map());

// 初始化设备列表
onMounted(async () => {
  await refreshDevices();
  navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
});

onBeforeUnmount(() => {
  navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  stopAllProcessors();
});

// 刷新设备列表
const refreshDevices = async () => {
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaDevices = await navigator.mediaDevices.enumerateDevices();
    devices.value = mediaDevices
      .filter((d) => d.kind === "audioinput")
      .map((d) => ({
        deviceId: d.deviceId,
        label: d.label || `麦克风 ${d.deviceId.slice(0, 5)}`,
        kind: d.kind,
      }));
  } catch (error) {
    console.error("设备枚举失败:", error);
  }
};

// 启动实时音频处理
const startProcessing = async (deviceId) => {
  if (activeProcessors.has(deviceId)) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        noiseSuppression: true,
        echoCancellation: false,
      },
    });

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    // 初始化 aubio
    const aubio = await aubioModule();
    const aubioPitch = new aubio.Pitch("default", 2048, 512, audioContext.sampleRate);

    const audioData = {
      deviceId,
      audioContext,
      stream,
      aubioPitch,
      status: "processing",
      pitches: reactive([]), // 存储音高数据用于显示
    };

    const scriptNode = audioContext.createScriptProcessor(2048, 1, 1);
    source.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

    scriptNode.onaudioprocess = (event) => {
      const inputBuffer = event.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);

      // 使用 aubio 检测音高
      const pitch = aubioPitch.do(inputData);
      if (pitch) {
        // 更新音高数据（保留最近100个数据点）
        audioData.pitches.length >= 100 && audioData.pitches.shift();
        audioData.pitches.push(pitch);

        // 更新 ECharts 图表
        updateChart(deviceId, audioData.pitches);
      }
    };

    activeProcessors.set(deviceId, audioData);
  } catch (error) {
    console.error(`设备 ${deviceId} 启动失败:`, error);
    activeProcessors.set(deviceId, {
      deviceId,
      status: "error",
    });
  }
};

// 停止处理
const stopProcessing = (deviceId) => {
  const processorData = activeProcessors.get(deviceId);
  if (!processorData) return;

  processorData.scriptNode.disconnect();
  processorData.audioContext.close();
  processorData.stream.getTracks().forEach((track) => track.stop());
  activeProcessors.delete(deviceId);
};

// 批量操作
const startAllProcessors = async () => {
  for (const deviceId of selectedDevices.value) {
    await startProcessing(deviceId);
  }
};

const stopAllProcessors = () => {
  Array.from(activeProcessors.keys()).forEach(stopProcessing);
};

// 更新 ECharts 图表
const updateChart = (deviceId, pitches) => {
  if (!charts.has(deviceId)) {
    const chartDom = document.createElement("div");
    chartDom.style.width = "100%";
    chartDom.style.height = "200px";
    document.querySelector(".chart-container").appendChild(chartDom);
    const chart = echarts.init(chartDom);
    charts.set(deviceId, chart);
  }

  const chart = charts.get(deviceId);
  const option = {
    xAxis: {
      type: "category",
      data: Array.from({ length: pitches.length }, (_, i) => i),
    },
    yAxis: {
      type: "value",
    },
    series: [
      {
        data: pitches,
        type: "line",
        smooth: true,
      },
    ],
  };
  chart.setOption(option);
};

// 设备状态显示
const getDeviceStatus = (deviceId) => {
  const processor = activeProcessors.get(deviceId);
  return processor?.status || "idle";
};

const statusText = (status) => {
  const statusMap = {
    idle: "🟢 空闲",
    processing: "🔴 监控中",
    error: "⚠️ 错误",
  };
  return statusMap[status] || "❓ 未知状态";
};
</script>

<style>
.chart-container {
  width: 100%;
  height: 200px;
}
</style>
