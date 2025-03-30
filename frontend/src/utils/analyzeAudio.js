import aubioModule from "aubiojs";
import { frequencyToNote } from "@/utils/common";
import JSZip from "jszip";
import { saveAs } from "file-saver";

// 分析AudioBuffer中的音高
export async function analyzeAudioBuffer(
  buffer,
  bufferSize,
  confidenceThreshold,
  medianFilterSize,
  saveSegments = false,
  fileName = "audio"
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
    segments: [], // 新增segment编号数组
  };

  // 用于收集所有音频段落的数组
  const audioSegments = [];
  const algorithm = "yin"; // 使用的音高检测算法
  const hopSize = Math.floor(bufferSize / 3);
  const dirName = `${fileName.replace(/\.[^/.]+$/, "")}_${algorithm}_${bufferSize}_${hopSize}`;

  // 分析整个音频文件
  const channels = buffer.numberOfChannels;
  const audioData = buffer.getChannelData(0); // 使用第一个声道
  const totalFrames = Math.floor((audioData.length - bufferSize) / hopSize);

  console.log(
    `开始分析音频: 音频时长=${audioData.length / buffer.sampleRate}秒, 采样率=${buffer.sampleRate}Hz, bufferSize=${bufferSize}, 通道数=${channels}, onset总帧数=${totalFrames}`
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

  const onsetTimesStr = onsetTimes.map((onset) => onset.time).join(', ');
  console.log(`检测到 ${onsetTimes.length} 个音频起始点, onsetTimes=${onsetTimesStr}`);
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

  // 保存有效的segment索引，用于映射
  const validSegments = [];

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

    // 记录有效的segment索引
    validSegments.push(segmentIndex);

    // 对当前段进行帧分析
    const segmentFrames = Math.floor(segmentLength / hopSize);
    console.log(
      `分析片段 ${segmentIndex + 1}/${onsetTimes.length - 1}: ${startOnset.time.toFixed(
        2
      )}s - ${endOnset.time.toFixed(2)}s (长度: ${segmentLength} 样本) 当前段的帧数: ${segmentFrames}`
    );

    // 用于存储当前段的主要频率
    let segmentFrequencies = [];
    let segmentConfidences = [];

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

      // 记录当前段的频率和置信度
      segmentFrequencies.push(frequency);
      segmentConfidences.push(confidence);

      // 记录时间点
      const timeInSeconds = frameStartIndex / buffer.sampleRate;
      results.times.push(timeInSeconds);

      // 记录当前点所属的segment编号（使用原始的segmentIndex）
      results.segments.push(segmentIndex);

      // 只保留频率大于0的结果，忽略置信度
      // if (frequency > 0) {
      //   results.frequencies.push(frequency);
      //   results.confidences.push(confidence);
      // } else {
      //   // 对于低置信度的结果，频率设为0
      //   results.frequencies.push(0);
      //   results.confidences.push(confidence);
      // }
      results.frequencies.push(frequency);
      results.confidences.push(confidence);
    }
    const segmentFrequenciesAndConfidencesStr = segmentFrequencies.map((f, i) => `${f}:${segmentConfidences[i]}`).join(', ');
    console.log(`分析完成, segmentIndex=${segmentIndex}, segmentFrequenciesAndConfidences=${segmentFrequenciesAndConfidencesStr}`)
    // 如果需要保存段落
    if (saveSegments && segmentFrames > 0) {
      // 计算段落的主要频率（取中位数或平均值）
      const validFrequencies = segmentFrequencies.filter((f) => f > 0);
      let dominantFrequency = 0;
      if (validFrequencies.length > 0) {
        // 使用中位数作为主要频率
        validFrequencies.sort((a, b) => a - b);
        dominantFrequency = validFrequencies[Math.floor(validFrequencies.length / 2)];
      }

      // 创建该段的音频数据
      const segmentAudioBuffer = new Float32Array(segmentLength);
      for (let i = 0; i < segmentLength; i++) {
        segmentAudioBuffer[i] = audioData[segmentStartIndex + i];
      }

      // 格式化文件名
      const formattedFrequency = dominantFrequency.toFixed(2);
      const formattedStartTime = startOnset.time.toFixed(3);
      const formattedEndTime = endOnset.time.toFixed(3);
      const segmentFileName = `${segmentIndex}_${formattedFrequency}_${formattedStartTime}_${formattedEndTime}.wav`;

      // 收集音频段落信息
      audioSegments.push({
        buffer: segmentAudioBuffer,
        sampleRate: buffer.sampleRate,
        fileName: segmentFileName,
      });
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

  // 如果需要保存段落，且有段落需要保存，则创建ZIP文件
  if (saveSegments && audioSegments.length > 0) {
    await createAndDownloadZip(audioSegments, dirName);
  }

  return results;
}

// 创建并下载ZIP文件
async function createAndDownloadZip(audioSegments, dirName) {
  console.log(`创建ZIP文件，包含 ${audioSegments.length} 个音频段落`);

  const zip = new JSZip();
  const folder = zip.folder(dirName);

  // 添加每个音频段落到ZIP文件
  for (let i = 0; i < audioSegments.length; i++) {
    const segment = audioSegments[i];
    const wavBuffer = createWavFile(segment.buffer, segment.sampleRate);
    folder.file(segment.fileName, wavBuffer);
  }

  // 生成ZIP文件并下载
  const zipBlob = await zip.generateAsync({ type: "blob" });
  saveAs(zipBlob, `${dirName}.zip`);

  console.log(`ZIP文件创建完成: ${dirName}.zip`);
}

// 创建WAV文件
function createWavFile(audioData, sampleRate) {
  // WAV文件头
  const numChannels = 1; // 单声道
  const bitsPerSample = 16;
  const blockAlign = numChannels * bitsPerSample / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = audioData.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // 写入WAV头
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM格式
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // 写入音频数据
  const volume = 0.8;
  let index = 44;
  for (let i = 0; i < audioData.length; i++) {
    // 将Float32转换为Int16
    const sample = Math.max(-1, Math.min(1, audioData[i])) * volume;
    const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(index, value, true);
    index += 2;
  }

  return buffer;
}

// 辅助函数：写入字符串到DataView
function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
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
