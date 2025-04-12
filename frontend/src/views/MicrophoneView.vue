<template>
  <h2 style="text-align: center">实时音高检测</h2>
  <DynamicsLineCharts :data="data" :isRealTime="true" />
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
            <input type="number" v-model="confidenceThreshold" min="0" max="1" step="0.01" />
          </div>
          <div>
            <label for="medianFilterSize">平滑度:</label>
            <input type="range" v-model="medianFilterSize" min="1" max="15" step="2" />
            <span>{{ medianFilterSize }}</span>
          </div>
          <div>
            <label for="pitchAlgorithm">音高检测算法:</label>
            <select v-model="pitchAlgorithm">
              <option value="default">默认</option>
              <option value="yinfft">YIN FFT</option>
              <option value="yin">YIN</option>
              <option value="mcomb">修改梳状滤波器</option>
              <option value="fcomb">快速梳状滤波器</option>
              <option value="schmitt">施密特触发器</option>
            </select>
          </div>
          <div>
            <label for="bufferSize">Buffer Size:</label>
            <input type="number" v-model="bufferSize" min="1024" max="16384" step="1024" />
          </div>
          <div>
            <label for="hopSize">Hop Size:</label>
            <input type="number" v-model="hopSize" min="256" max="4096" step="256" />
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
const confidenceThreshold = ref(0.5); // 音高检测的置信度阈值
const medianFilterSize = ref(5); // 中值滤波器大小
const pitchAlgorithm = ref("yin"); // 音高检测算法，默认为fcomb
const bufferSize = ref(4096); // 缓冲区大小
const hopSize = ref(1024); // Hop Size
const data = ref([]);
// 存储所有检测到的音高数据，包括音高、置信度和振幅
const allPitchData = ref([]);
/* data 数据说明，xData横坐标时间，voice为不同声部频率
  data:[
     { xData: 1, voice1: 400, voice2: 500 },
     { xData: 2, voice1: 400, voice2: 500, voice3: 600 },
     { xData: 3, voice1: 450, voice3: 550 }
   ]
*/

let isRunning = false;

// const maxFrequency = 2000

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
    console.log(`标准音A: ${standardA.value}Hz`);
    // 请求麦克风访问权限
    console.log("正在请求麦克风访问权限...");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("成功获取麦克风权限");
    console.log("麦克风流信息:", stream.getAudioTracks()[0].getSettings());

    // 创建音频上下文
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    microphone = audioContext.createMediaStreamSource(stream);
    scriptProcessor = audioContext.createScriptProcessor(bufferSize.value, 1, 1);
    microphone.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination);
    console.log(
      `音频上下文创建成功, 采样率: ${audioContext.sampleRate}Hz, 缓冲区大小: ${bufferSize.value}`
    );
    console.log("音频处理链: 麦克风 -> scriptProcessor -> destination");

    // 使用Aubio检测音高
    console.log("正在加载Aubio模块...");
    const aubio = await aubioModule();
    console.log("Aubio模块加载成功");

    const pitchDetector = new aubio.Pitch(
      pitchAlgorithm.value,
      bufferSize.value,
      hopSize.value,
      audioContext.sampleRate
    );
    console.log(
      `音高检测器创建成功，算法: ${pitchAlgorithm.value}, buffersize: ${bufferSize.value}, hopSize: ${hopSize.value}, 采样率: ${audioContext.sampleRate}`
    );

    // 设置置信度阈值
    // if (pitchDetector.setTolerance) {
    //   pitchDetector.setTolerance(1.0 - confidenceThreshold.value);
    //   console.log(`设置音高检测器容差: ${1.0 - confidenceThreshold.value}`);
    // } else {
    //   console.warn("警告: 音高检测器不支持设置容差");
    // }

    // 用于平滑处理的历史频率数据
    const freqHistory = [];

    // 开始时间
    const startTime = audioContext.currentTime;
    console.log(`开始记录时间: ${startTime}`);

    // 清空现有数据
    data.value = [];
    console.log("数据已重置");

    // 添加音频处理计数器，用于调试
    let processCount = 0;
    let lastLogTime = 0;

    scriptProcessor.onaudioprocess = (event) => {
      if (!isRunning) return;

      processCount++;
      const currentTime = audioContext.currentTime - startTime;

      // 每秒记录一次处理状态，避免日志过多
      if (currentTime - lastLogTime >= 1.0) {
        console.log(
          `音频处理中: 已处理${processCount}个缓冲区, 当前时间: ${currentTime.toFixed(2)}秒`
        );
        lastLogTime = currentTime;
      }

      const audioData = event.inputBuffer.getChannelData(0);

      // 每5秒记录一次音频数据的统计信息
      if (
        Math.floor(currentTime) % 5 === 0 &&
        Math.floor(currentTime) !== Math.floor(lastLogTime)
      ) {
        const sum = audioData.reduce((a, b) => a + Math.abs(b), 0);
        const avg = sum / audioData.length;
        const max = Math.max(...audioData.map((v) => Math.abs(v)));
        console.log(
          `音频数据统计: 平均振幅=${avg.toFixed(4)}, 最大振幅=${max.toFixed(4)}, 样本数=${
            audioData.length
          }`
        );
      }

      // 检测音高
      console.log("正在执行音高检测...");
      const frequency = pitchDetector.do(audioData);
      const confidence = pitchDetector.getConfidence ? pitchDetector.getConfidence() : 1.0;

      // 计算当前音频数据的振幅
      const sum = audioData.reduce((a, b) => a + Math.abs(b), 0);
      const amplitude = sum / audioData.length;

      if (pitchDetector.getPitch) {
        console.log(`原始频率: ${frequency}Hz, 置信度: ${confidence}`);
      }

      // 只处理置信度高于阈值的结果 && confidence >= confidenceThreshold.value
      if (frequency > 0 && confidence >= confidenceThreshold.value) {
        // 添加到历史数据
        freqHistory.push(frequency);
        console.log(`频率历史记录: [${freqHistory.join(", ")}]`);

        // 保持历史数据长度
        if (freqHistory.length > medianFilterSize.value) {
          freqHistory.shift();
        }

        // 应用中值滤波
        let smoothedFreq = frequency;
        /* 注释掉中值滤波
        if (freqHistory.length >= 3) {
          const sortedFreqs = [...freqHistory].sort((a, b) => a - b);
          smoothedFreq = sortedFreqs[Math.floor(sortedFreqs.length / 2)];
          console.log(`应用中值滤波后频率: ${smoothedFreq}Hz`);
        }
        */

        const note = frequencyToNote(smoothedFreq, standardA.value);
        console.log(`转换为音符: ${note} (基于标准音A=${standardA.value}Hz) 置信度: ${confidence}`);

        textTip.value = `当前音高: ${smoothedFreq.toFixed(
          1
        )} Hz (${note})\n置信度: ${confidence.toFixed(2)}`;
        // 更新图表数据
        updateChart(smoothedFreq, currentTime);

        // 存储音高数据
        allPitchData.value.push({
          time: currentTime,
          frequency: smoothedFreq,
          note: note,
          confidence: confidence,
          amplitude: amplitude,
        });
      } else {
        // console.log(`频率或置信度低于阈值，忽略此数据点 (频率=${frequency}, 置信度=${confidence}, 阈值=${confidenceThreshold.value})`);
      }
    };

    isRunning = true;
    disableStartButton.value = true;
    disableStopButton.value = false;
    console.log("音高检测已启动");
  } catch (error) {
    console.error("无法访问麦克风:", error);
    console.error("错误详情:", error.name, error.message, error.stack);
    alert("无法访问麦克风: " + error.message);
  }
}

// 停止检测
function stopPitchDetection() {
  if (!isRunning) return;

  console.log("停止音高检测...");
  console.log(
    `停止时数据点数量: ${data.value.length}，停止检测时间: ${new Date().toLocaleString()}`
  );

  // 在控制台显示所有检测到的音高数据
  console.log("所有检测到的音高数据:");
  console.log("时间(秒)\t频率(Hz)\t音符\t置信度\t振幅");
  allPitchData.value.forEach((item) => {
    console.log(
      `${item.time.toFixed(2)}\t${item.frequency.toFixed(1)}\t${
        item.note
      }\t${item.confidence.toFixed(3)}\t${item.amplitude.toFixed(5)}`
    );
  });

  // 重置音高数据
  allPitchData.value = [];

  isRunning = false;

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    console.log("scriptProcessor已断开连接");
  }

  if (microphone) {
    microphone.disconnect();
    console.log("麦克风已断开连接");
  }

  if (audioContext) {
    audioContext
      .close()
      .then(() => {
        console.log("音频上下文已关闭");
      })
      .catch((err) => {
        console.error("关闭音频上下文时出错:", err);
      });
    audioContext = null;
  }

  disableStartButton.value = false;
  disableStopButton.value = true;

  textTip.value = "等待检测音高...";
  console.log("音高检测已停止");
}
</script>

<style scoped></style>
