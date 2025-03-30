<template>
  <h2 style="text-align: center">音频文件音高监测</h2>
  <line-charts :data="data" :current-time="currentPlayTime" @time-click="handleTimeClick" />
  <div class="controls">
    <div>{{ textTip }}</div>
    <div class="settings">
      <label for="standardA">标准音A (Hz):</label>
      <input type="number" v-model="standardA" min="400" max="500" step="1" />
      <button @click="updateStandardA">更新</button>
    </div>
    <div class="settings" style="margin-top: 15px">
      <label for="audioFile"
        >上传音频文件:
        {{
          selectedFiles && selectedFiles.length > 0
            ? `已选择 ${selectedFiles.length} 个文件`
            : "未选择文件"
        }}</label
      >
      <input type="file" accept="audio/*" @change="handleFileSelect" multiple />
      <button @click="analyzeAudioFile" :disabled="!selectedFiles || selectedFiles.length === 0">
        分析音频
      </button>
      <!-- 添加播放/暂停按钮 -->
      <button @click="togglePlayback" :disabled="!audioBuffers || audioBuffers.length === 0">
        {{ isPlaying ? "暂停" : "播放" }}
      </button>

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
              type="text"
              v-model="confidenceThreshold"
              pattern="[0-9]+(\.[0-9]+)?"
              title="请输入0到1之间的数字"
            />  
            <span>{{ confidenceThreshold }}</span>
          </div>
          <div>
            <label for="medianFilterSize">平滑度:</label>
            <input type="range" v-model="medianFilterSize" min="1" max="15" step="1" value="5" />
            <span>{{ medianFilterSize }}</span>
          </div>
          <div>
            <label for="saveSegments">保存音频段落:</label>
            <input type="checkbox" v-model="saveSegments" id="saveSegments" />
            <span>{{ saveSegments ? '是' : '否' }}</span>
          </div>
        </div>
      </details>
    </div>
  </div>
</template>
<script setup>
import { ref, onBeforeUnmount } from "vue";
import { analyzeAudioBuffer } from "@/utils/analyzeAudio";
import { useRouter } from "vue-router";
const router = useRouter();
let audioContext = null;
const textTip = ref("等待检测音高...");
const standardA = ref(440); // 标准音A的频率，默认440Hz
const selectedFiles = ref([]); // 用于存储选中的多个文件
const confidenceThreshold = ref(0.01); // 音高检测的置信度阈值，大幅降低以捕获更多数据点
const medianFilterSize = ref(5); // 中值滤波器大小
const saveSegments = ref(false); // 是否保存音频段落
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

const audioBuffers = ref([]); // 存储上传的多个音频文件
const isPlaying = ref(false);
const pauseTime = ref(0);
let playStartTime = 0;
let sources = [];

const currentPlayTime = ref(0);
let animationFrameId = null;

// 更新标准音A
function updateStandardA() {
  if (!isNaN(standardA.value) && standardA.value >= 400 && standardA.value <= 500) {
    // 清空数据重新开始
    data.value = [];
  }
}

// 处理文件选择
function handleFileSelect(event) {
  const files = event.target.files;
  selectedFiles.value = files && files.length > 0 ? Array.from(files) : [];
}

// 分析上传的音频文件
async function analyzeAudioFile() {
  const files = selectedFiles.value;

  if (!files || files.length === 0) {
    alert("请先选择至少一个音频文件");
    return;
  }

  // 重置状态
  stopAudio();
  isPlaying.value = false;
  pauseTime.value = 0;
  data.value = [];
  audioBuffers.value = [];

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
      audioBuffers.value.push({
        buffer: audioBuffer,
        name: file.name,
      });

      // 分析音频文件
      const pitchResults = await analyzeAudioBuffer(
        audioBuffer,
        bufferSize,
        confidenceThreshold.value,
        medianFilterSize.value,
        saveSegments.value,
        file.name
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
  console.log(
    `文件 ${fileName} 分析结果: ${results.frequencies.length} 个频率点, ${results.times.length} 个时间点`
  );
  console.log(`文件 ${fileName} 有效频率点: ${validFrequencies.length} 个`);
  console.log(
    `文件 ${fileName} 频率范围: ${Math.min(...validFrequencies)} - ${Math.max(...validFrequencies)}`
  );
  console.log(`文件 ${fileName} 检测到 ${results.onsets.length} 个音频起始点`);

  // 创建数据点数组
  const voiceKey = `voice${fileIndex + 1}`;

  // 保存文件名到全局变量，用于图例显示
  window.voiceFileNames = window.voiceFileNames || {};
  window.voiceSegmentInfo = window.voiceSegmentInfo || {};
  
  // 记录当前文件的segment信息
  window.voiceSegmentInfo[voiceKey] = {
    fileName: fileName,
    segmentCount: results.onsets ? results.onsets.length : 0
  };
  
  // 将文件名改为显示segment编号的格式
  window.voiceFileNames[voiceKey] = `Segment ${fileIndex + 1}`;

  results.times.forEach((time, i) => {
    if (results.frequencies[i] > 0) {
      // 修改时间点存储为数值
      const timePoint = Number(time.toFixed(2)); // 转为数值类型
      const existingPoint = data.value.find(
        (point) => Math.abs(point.xData - timePoint) < 0.001 // 浮点数精度处理
      );

      // 获取当前点的segment编号（直接使用原始的segment编号）
      const segmentIndex = results.segments[i];

      if (existingPoint) {
        existingPoint[voiceKey] = results.frequencies[i];
        // 添加segment编号信息
        existingPoint[`${voiceKey}_segment`] = segmentIndex;
      } else {
        const newPoint = {
          xData: timePoint,
          [voiceKey]: results.frequencies[i],
          // 添加segment编号信息
          [`${voiceKey}_segment`]: segmentIndex
        };
        data.value.push(newPoint);
      }
    }
  });
  // 添加数据排序保证时间顺序
  data.value.sort((a, b) => a.xData - b.xData);
  // 更新当前音高显示
  const validPoints = results.frequencies.filter((f) => f > 0).length;
  console.log(
    `文件 ${fileName} 分析完成，共检测到 ${validPoints} 个有效音高点，${results.onsets.length} 个音频起始点`
  );
}
// 播放控制
async function togglePlayback() {
  if (isPlaying.value) {
    pauseAudio();
  } else {
    await playAudio();
  }
}

// 处理图表时间点击事件
async function handleTimeClick(time) {
  console.log(`点击了时间点: ${time}秒`);
  
  // 确保时间是有效的数字
  if (typeof time !== 'number' || isNaN(time)) {
    console.error('收到无效的时间点:', time);
    return;
  }
  
  // 设置新的播放位置
  pauseTime.value = Math.max(0, time);
  console.log(`设置播放位置为: ${pauseTime.value}秒`);
  
  // 如果当前正在播放，则从新位置继续播放
  if (isPlaying.value) {
    console.log('当前正在播放，将从新位置继续播放');
    // 先完全停止当前播放
    isPlaying.value = false; // 先设置为非播放状态，避免状态混乱
    cancelAnimationFrame(animationFrameId);
    stopAudio();
    // 短暂延迟后重新开始播放
    setTimeout(async () => {
      await playAudio();
    }, 50);
  } else {
    // 更新当前时间显示，但不播放
    console.log('当前未播放，仅更新时间指示器位置');
    currentPlayTime.value = pauseTime.value;
  }
}

function updatePlayTime() {
  if (isPlaying.value) {
    // 计算当前播放时间
    currentPlayTime.value = audioContext.currentTime - playStartTime + pauseTime.value;
    animationFrameId = requestAnimationFrame(updatePlayTime);
  }
}

async function playAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  stopAudio();

  const startTime = audioContext.currentTime;
  const offset = pauseTime.value;
  console.log(`开始播放: 当前时间=${startTime}, 偏移量=${offset}秒`);

  let endedCount = 0;
  sources = audioBuffers.value.map((bufferInfo) => {
    const source = audioContext.createBufferSource();
    source.buffer = bufferInfo.buffer;
    source.connect(audioContext.destination);
    source.start(startTime, offset);
    source.onended = () => {
      endedCount++;
      if (endedCount === audioBuffers.value.length) {
        isPlaying.value = false;
        pauseTime.value = 0;
      }
    };
    return source;
  });

  playStartTime = startTime;
  isPlaying.value = true;
  
  // 重置当前播放时间以确保从正确位置开始更新
  currentPlayTime.value = pauseTime.value;
  
  // 开始更新时间
  cancelAnimationFrame(animationFrameId); // 确保没有多个动画帧请求
  updatePlayTime();
}

function pauseAudio() {
  cancelAnimationFrame(animationFrameId);
  const elapsed = audioContext.currentTime - playStartTime;
  pauseTime.value += elapsed;
  stopAudio();
  isPlaying.value = false;
}

function stopAudio() {
  sources.forEach((source) => {
    try {
      source.stop();
      source.disconnect();
    } catch (e) {}
  });
  sources = [];
}

onBeforeUnmount(() => {
  stopAudio();
  if (audioContext) {
    audioContext.close();
  }
});
</script>

<style scoped></style>
