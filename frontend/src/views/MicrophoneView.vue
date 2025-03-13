<template>
  <h2 style="text-align: center">实时音高检测</h2>
  <line-charts :data="data" />
  <div class="controls">
    <div>{{ textTip }}</div>
    <div class="settings">
      <label for="standardA">标准音A (Hz):</label>
      <input type="number" v-model="standardA" min="400" max="500" step="1" />
      <button @click="updateStandardA">更新</button>
    </div>
    <button @click="startPitchDetection" :disabled="disableStartButton">开始检测</button>
    <button @click="stopPitchDetection" :disabled="disableStopButton">停止检测</button>
    <button @click="router.push('/')">上传音频</button>
    <div class="settings" style="margin-top: 15px">
      <details>
        <summary>高级设置</summary>
        <div
          style="
            margin-top: 10px;
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            gap: 10px;
          "
        >
          <div>
            <label for="confidenceThreshold">置信度阈值:</label>
            <input
              type="range"
              v-model="confidenceThreshold"
              min="0"
              max="1"
              step="0.01"
            />
            <span>{{ confidenceThreshold }}</span>
          </div>
          <div>
            <label for="medianFilterSize">平滑度:</label>
            <input type="range" v-model="medianFilterSize" min="1" max="15" step="2" />
            <span>{{ medianFilterSize }}</span>
          </div>
        </div>
      </details>
    </div>

  </div>
</template>
<script setup>
import { ref } from "vue";
import { useRouter } from "vue-router";
import aubioModule from "aubiojs";
import { frequencyToNote } from "@/utils/common";
const router = useRouter();
let audioContext = null;
let microphone = null;
let scriptProcessor = null;
const textTip = ref("等待检测音高...");
const standardA = ref(440); // 标准音A的频率，默认440Hz
const disableStartButton = ref(false);
const disableStopButton = ref(false);
const confidenceThreshold = ref(0.01); // 音高检测的置信度阈值，大幅降低以捕获更多数据点
const medianFilterSize = ref(5); // 中值滤波器大小
const data = ref([]);
/* data 数据说明，xData横坐标时间，voice为不同声部频率
  data:[
     { xData: 1, voice1: 400, voice2: 500 },
     { xData: 2, voice1: 400, voice2: 500, voice3: 600 },
     { xData: 3, voice1: 450, voice3: 550 }
   ]
*/

let isRunning = false;

// const maxFrequency = 2000
const bufferSize = 1 << 12;

// 更新图表数据
function updateChart(frequency, time) {
  console.log(`更新图表数据: 时间=${time}秒, 频率=${frequency}Hz`);
  console.log(`更新前数据长度: ${data.value.length}`);
  data.value = [
    ...data.value,
    {
      xData: time,
      voice1: frequency,
    },
  ];
  console.log(`更新后数据长度: ${data.value.length}`);
  console.log(`最新数据点: `, data.value[data.value.length - 1]);
}
// 更新标准音A
function updateStandardA() {
  if (!isNaN(standardA.value) && standardA.value >= 400 && standardA.value <= 500) {
    // 清空数据重新开始
    data.value = [];
  }
}

// 开始检测
async function startPitchDetection() {
  if (isRunning) return;

  try {
    console.log("开始音高检测...");
    console.log(`当前置信度阈值: ${confidenceThreshold.value}, 平滑度: ${medianFilterSize.value}`);
    // 请求麦克风访问权限
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("成功获取麦克风权限");

    // 创建音频上下文
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    microphone = audioContext.createMediaStreamSource(stream);
    scriptProcessor = audioContext.createScriptProcessor(bufferSize, 1, 1);
    microphone.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);
    console.log(`音频上下文创建成功, 采样率: ${audioContext.sampleRate}Hz, 缓冲区大小: ${bufferSize}`);

    // 使用Aubio检测音高
    const aubio = await aubioModule();
    console.log("Aubio模块加载成功");
    const pitchDetector = new aubio.Pitch(
      "fcomb",
      scriptProcessor.bufferSize * 4,
      scriptProcessor.bufferSize,
      audioContext.sampleRate
    );
    console.log("音高检测器创建成功");

    // 创建onset检测器
    const onsetDetector = new aubio.Onset(
      "default", // 使用默认算法
      scriptProcessor.bufferSize * 2,
      scriptProcessor.bufferSize,
      audioContext.sampleRate
    );
    console.log("Onset检测器创建成功");

    // 设置置信度阈值
    if (pitchDetector.setTolerance) {
      pitchDetector.setTolerance(1.0 - confidenceThreshold.value);
      console.log(`设置音高检测器容差: ${1.0 - confidenceThreshold.value}`);
    }

    // 用于平滑处理的历史频率数据
    const freqHistory = [];

    // 用于存储实时检测的onset点
    const realtimeOnsets = [];
    let lastOnsetTime = 0;

    // 开始时间
    const startTime = audioContext.currentTime;
    console.log(`开始记录时间: ${startTime}`);
    
    // 清空现有数据
    data.value = [];
    console.log("数据已重置");
    
    scriptProcessor.onaudioprocess = (event) => {
      if (!isRunning) return;

      const audioData = event.inputBuffer.getChannelData(0);
      const currentTime = audioContext.currentTime - startTime;
      let onsetTime = null;
      // 检测onset
      if (onsetDetector.do(audioData)) {
        onsetTime = currentTime;

        // 防止过于频繁的onset检测（至少间隔100ms）
        if (onsetTime - lastOnsetTime > 0.1) {
          lastOnsetTime = onsetTime;
          realtimeOnsets.push(onsetTime);

          // 限制存储的onset数量
          if (realtimeOnsets.length > 50) {
            realtimeOnsets.shift();
          }

          // 在控制台显示onset检测
          console.log(`检测到音频起始点: ${onsetTime.toFixed(2)}秒`);

          // 更新显示
          textTip.value = `检测到音频起始点: ${onsetTime.toFixed(2)}秒`;
          // 检测音高
          const frequency = pitchDetector.do(audioData);
          const confidence = pitchDetector.getConfidence ? pitchDetector.getConfidence() : 1.0;

          console.log(`原始频率: ${frequency}Hz, 置信度: ${confidence}`);

          // 只处理置信度高于阈值的结果
          if (frequency > 0 && confidence >= confidenceThreshold.value) {
            // 添加到历史数据
            freqHistory.push(frequency);
            console.log(`频率历史记录: [${freqHistory.join(', ')}]`);

            // 保持历史数据长度
            if (freqHistory.length > medianFilterSize.value) {
              freqHistory.shift();
            }

            // 应用中值滤波
            let smoothedFreq = frequency;
            if (freqHistory.length >= 3) {
              const sortedFreqs = [...freqHistory].sort((a, b) => a - b);
              smoothedFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)];
              console.log(`应用中值滤波后频率: ${smoothedFreq}Hz`);
            }

            const note = frequencyToNote(smoothedFreq, standardA.value);
            textTip.value = `当前音高: ${smoothedFreq.toFixed(
              1
            )} Hz (${note})\n置信度: ${confidence.toFixed(2)}`;
            // 更新图表数据
            updateChart(smoothedFreq, currentTime);
          } else {
            console.log(`频率或置信度低于阈值，忽略此数据点 (频率=${frequency}, 置信度=${confidence}, 阈值=${confidenceThreshold.value})`);
          }
        }
      }
    };

    isRunning = true;
    disableStartButton.value = true;
    disableStopButton.value = false;
    console.log("音高检测已启动");
  } catch (error) {
    console.error("无法访问麦克风:", error);
    alert("无法访问麦克风: " + error.message);
  }
}

// 停止检测
function stopPitchDetection() {
  if (!isRunning) return;

  console.log("停止音高检测...");
  console.log(`停止时数据点数量: ${data.value.length}`);

  isRunning = false;

  if (scriptProcessor) {
    scriptProcessor.disconnect();
  }

  if (microphone) {
    microphone.disconnect();
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  disableStartButton.value = false;
  disableStopButton.value = true;

  textTip.value = "等待检测音高...";
  console.log("音高检测已停止");
}
</script>

<style scoped></style>
