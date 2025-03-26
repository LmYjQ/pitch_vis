<template>
  <h2 style="text-align: center;">音频文件音高监测</h2>
  <line-charts :data="data" />
  <div class="controls">
    <div>{{ textTip }}</div>
    <div class="settings">
      <label for="standardA">标准音A (Hz):</label>
      <input type="number" v-model="standardA" min="400" max="500" step="1" />
      <button @click="updateStandardA">更新</button>
    </div>
    <div class="settings" style="margin-top: 15px">
      <label for="audioFile">上传音频文件: {{ selectedFiles && selectedFiles.length > 0 ? `已选择 ${selectedFiles.length} 个文件` : '未选择文件' }}</label>
      <input type="file" accept="audio/*" @change="handleFileSelect" multiple />
      <button @click="analyzeAudioFile" :disabled="!selectedFiles || selectedFiles.length === 0">分析音频</button>
      <button @click="router.push('/m')">实时检测</button>
    </div>
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
              value="0.01"
            />
            <span>{{ confidenceThreshold }}</span>
          </div>
          <div>
            <label for="medianFilterSize">平滑度:</label>
            <input type="range" v-model="medianFilterSize" min="1" max="15" step="2" value="5" />
            <span>{{ medianFilterSize }}</span>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>
<script setup>
import { ref } from "vue";
import { analyzeAudioBuffer } from "@/utils/analyzeAudio";
import { useRouter } from 'vue-router'
const router = useRouter()
let audioContext = null;
const textTip = ref("等待检测音高...");
const standardA = ref(440); // 标准音A的频率，默认440Hz
const selectedFiles = ref([]); // 用于存储选中的多个文件
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

// const maxFrequency = 2000
const bufferSize = 1 << 12;

let audioBuffers = []; // 存储上传的多个音频文件

// 更新标准音A
function updateStandardA() {
  if (!isNaN(standardA.value) && standardA.value >= 400 && standardA.value <= 500) {
    // 清空数据重新开始
    data.value = [];
  }
}

// 处理文件选择
function handleFileSelect(event) {
  // 获取选中的文件
  const files = event.target.files;
  if (files && files.length > 0) {
    selectedFiles.value = Array.from(files);
    console.log("选中的文件:", selectedFiles.value);
  } else {
    selectedFiles.value = [];
  }
}

// 分析上传的音频文件
async function analyzeAudioFile() {
  const files = selectedFiles.value;

  if (!files || files.length === 0) {
    alert("请先选择至少一个音频文件");
    return;
  }

  // 重置图表数据
  data.value = [];
  audioBuffers = [];

  // 显示加载状态
  textTip.value = "正在分析音频文件...";

  try {
    // 创建AudioContext（如果不存在）
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // 处理每个文件
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      textTip.value = `正在分析音频文件 ${i + 1}/${files.length}: ${file.name}...`;
      
      // 读取文件
      const arrayBuffer = await file.arrayBuffer();

      // 解码音频数据
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      audioBuffers.push({
        buffer: audioBuffer,
        name: file.name
      });

      // 分析音频文件
      const pitchResults = await analyzeAudioBuffer(
        audioBuffer,
        bufferSize,
        confidenceThreshold.value,
        medianFilterSize.value
      );

      // 更新图表，传入文件索引用于区分不同声部
      updateChartWithFileAnalysis(pitchResults, i, file.name);
    }

    // 更新完成状态
    const totalPoints = data.value.length;
    textTip.value = `分析完成，共处理 ${files.length} 个文件，生成 ${totalPoints} 个数据点`;
    
  } catch (error) {
    console.error("分析音频文件时出错:", error);
    alert("分析音频文件时出错: " + error?.message);
  }
}

// 使用文件分析结果更新图表
function updateChartWithFileAnalysis(results, fileIndex, fileName) {
  // 确保数据非空
  if (!results.times.length || !results.frequencies.length) {
    console.log(`文件 ${fileName} 分析未找到有效的音高数据`);
    return;
  }

  // 获取有效频率点
  const validFrequencies = results.frequencies.filter((f) => f > 0);

  if (validFrequencies.length === 0) {
    console.log(`文件 ${fileName} 分析未找到有效的频率点`);
    return;
  }

  // 打印调试信息
  console.log(`文件 ${fileName} 分析结果: ${results.frequencies.length} 个频率点, ${results.times.length} 个时间点`);
  console.log(`文件 ${fileName} 有效频率点: ${validFrequencies.length} 个`);
  console.log(`文件 ${fileName} 频率范围: ${Math.min(...validFrequencies)} - ${Math.max(...validFrequencies)}`);
  console.log(`文件 ${fileName} 检测到 ${results.onsets.length} 个音频起始点`);

  // 创建数据点数组
  const voiceKey = `voice${fileIndex + 1}`;
  
  // 保存文件名到全局变量，用于图例显示
  if (!window.voiceFileNames) {
    window.voiceFileNames = {};
  }
  window.voiceFileNames[voiceKey] = fileName;
  
  for (let i = 0; i < results.times.length; i++) {
    if (results.frequencies[i] > 0) {
      const timePoint = results.times[i].toFixed(2);
      
      // 查找是否已经存在相同时间点的数据
      const existingPointIndex = data.value.findIndex(point => point.xData === timePoint);
      
      if (existingPointIndex >= 0) {
        // 如果存在相同时间点，则添加当前声部的数据
        data.value[existingPointIndex][voiceKey] = results.frequencies[i];
      } else {
        // 如果不存在相同时间点，则创建新的数据点
        const newPoint = { xData: timePoint };
        newPoint[voiceKey] = results.frequencies[i];
        data.value.push(newPoint);
      }
    }
  }

  // 更新当前音高显示
  const validPoints = results.frequencies.filter((f) => f > 0).length;
  console.log(`文件 ${fileName} 分析完成，共检测到 ${validPoints} 个有效音高点，${results.onsets.length} 个音频起始点`);
}
</script>

<style scoped></style>
