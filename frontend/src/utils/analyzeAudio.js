import aubioModule from "aubiojs";
import { frequencyToNote } from "@/utils/common";
// 分析AudioBuffer中的音高
export async function analyzeAudioBuffer(
  buffer,
  bufferSize,
  confidenceThreshold,
  medianFilterSize
) {
  // 初始化Aubio
  const aubio = await aubioModule();

  // 创建onset检测器
  const onsetDetector = new aubio.Onset(
    "default", // 使用默认算法
    bufferSize * 2,
    Math.floor(bufferSize / 3),
    buffer.sampleRate
  );

  // 创建音高检测器
  const pitchDetector = new aubio.Pitch(
    "yinfft", // 使用yinfft算法，通常对音乐信号效果更好
    bufferSize,
    Math.floor(bufferSize / 3),
    buffer.sampleRate
  );

  // 设置置信度阈值
  if (pitchDetector.setTolerance) {
    pitchDetector.setTolerance(1.0 - confidenceThreshold);
  }

  const results = {
    times: [],
    frequencies: [],
    notes: [],
    confidences: [],
    onsets: [], // 新增onset时间点数组
  };

  // 分析整个音频文件
  const channels = buffer.numberOfChannels;
  const audioData = buffer.getChannelData(0); // 使用第一个声道
  const hopSize = Math.floor(bufferSize / 3);
  const totalFrames = Math.floor(audioData.length / hopSize);

  console.log(
    `开始分析音频: 采样率=${buffer.sampleRate}Hz, 通道数=${channels}, 总帧数=${totalFrames}`
  );

  // 创建临时Float32Array用于处理
  const tempBuffer = new Float32Array(bufferSize);

  // 第一步：检测所有onset点
  console.log("步骤1: 检测音频起始点(onset)...");
  const onsetTimes = [];

  for (let i = 0; i < totalFrames; i++) {
    // 填充临时缓冲区
    tempBuffer.fill(0);

    // 复制当前帧的数据到临时缓冲区
    const startIndex = i * hopSize;
    const samplesToProcess = Math.min(bufferSize, audioData.length - startIndex);

    for (let j = 0; j < samplesToProcess; j++) {
      tempBuffer[j] = audioData[startIndex + j];
    }

    // 检测onset
    if (onsetDetector.do(tempBuffer)) {
      const timeInSeconds = startIndex / buffer.sampleRate;
      onsetTimes.push({
        time: timeInSeconds,
        index: startIndex,
      });
    }
  }

  console.log(`检测到 ${onsetTimes.length} 个音频起始点`);
  results.onsets = onsetTimes.map((onset) => onset.time);

  // 如果没有检测到onset，则添加一个起始点
  if (onsetTimes.length === 0) {
    onsetTimes.push({
      time: 0,
      index: 0,
    });
  }

  // 确保最后一个onset后的音频也被处理
  onsetTimes.push({
    time: audioData.length / buffer.sampleRate,
    index: audioData.length,
  });

  // 第二步：对每个onset之间的音频段进行音高分析
  console.log("步骤2: 对每个音频段进行音高分析...");

  let rawFrequencies = [];
  let rawConfidences = [];

  for (let segmentIndex = 0; segmentIndex < onsetTimes.length - 1; segmentIndex++) {
    const startOnset = onsetTimes[segmentIndex];
    const endOnset = onsetTimes[segmentIndex + 1];

    // 计算当前段的起始和结束样本索引
    const segmentStartIndex = startOnset.index;
    const segmentEndIndex = endOnset.index;
    const segmentLength = segmentEndIndex - segmentStartIndex;

    // 跳过太短的片段
    if (segmentLength < bufferSize) {
      console.log(
        `跳过过短的片段: ${startOnset.time.toFixed(2)}s - ${endOnset.time.toFixed(
          2
        )}s (长度: ${segmentLength} 样本)`
      );
      continue;
    }

    console.log(
      `分析片段 ${segmentIndex + 1}/${onsetTimes.length - 1}: ${startOnset.time.toFixed(
        2
      )}s - ${endOnset.time.toFixed(2)}s (长度: ${segmentLength} 样本)`
    );

    // 对当前段进行帧分析
    const segmentFrames = Math.floor(segmentLength / hopSize);

    for (let i = 0; i < segmentFrames; i++) {
      // 填充临时缓冲区
      tempBuffer.fill(0);

      // 复制当前帧的数据到临时缓冲区
      const frameStartIndex = segmentStartIndex + i * hopSize;
      const samplesToProcess = Math.min(bufferSize, segmentEndIndex - frameStartIndex);

      for (let j = 0; j < samplesToProcess; j++) {
        tempBuffer[j] = audioData[frameStartIndex + j];
      }

      // 检测音高
      const frequency = pitchDetector.do(tempBuffer);
      const confidence = pitchDetector.getConfidence ? pitchDetector.getConfidence() : 1.0;

      // 记录原始数据用于调试
      rawFrequencies.push(frequency);
      rawConfidences.push(confidence);

      // 记录时间点
      const timeInSeconds = frameStartIndex / buffer.sampleRate;
      results.times.push(timeInSeconds);

      // 只保留频率大于0的结果，忽略置信度
      if (frequency > 0) {
        results.frequencies.push(frequency);
        results.confidences.push(confidence);
      } else {
        // 对于低置信度的结果，频率设为0
        results.frequencies.push(0);
        results.confidences.push(confidence);
      }
    }
  }

  // 输出调试信息
  console.log(
    `原始频率检测: ${rawFrequencies.filter((f) => f > 0).length}/${rawFrequencies.length} 个有效点`
  );
  console.log(
    `置信度分布: 最小=${Math.min(...rawConfidences).toFixed(2)}, 最大=${Math.max(
      ...rawConfidences
    ).toFixed(2)}, 平均=${(
      rawConfidences.reduce((a, b) => a + b, 0) / rawConfidences.length
    ).toFixed(2)}`
  );
  console.log(
    `应用置信度阈值 ${confidenceThreshold} 后: ${results.frequencies.filter((f) => f > 0).length}/${
      results.frequencies.length
    } 个有效点`
  );

  // 应用中值滤波平滑频率
  if (medianFilterSize > 1) {
    const filteredFreqs = medianFilter(results.frequencies, medianFilterSize);
    results.frequencies = filteredFreqs;
  }

  // 计算音符
  results.notes = results.frequencies.map((freq) => (freq > 0 ? frequencyToNote(freq) : ""));

  return results;
}

// 中值滤波函数
function medianFilter(array, size) {
  if (size <= 1 || array.length < size) return array;

  const result = [];
  const halfSize = Math.floor(size / 2);

  for (let i = 0; i < array.length; i++) {
    const start = Math.max(0, i - halfSize);
    const end = Math.min(array.length, i + halfSize + 1);
    const window = array.slice(start, end).filter((val) => val > 0);

    if (window.length === 0) {
      result.push(array[i]);
    } else {
      // 排序并取中值
      window.sort((a, b) => a - b);
      const median = window[Math.floor(window.length / 2)];
      result.push(median);
    }
  }

  return result;
}
