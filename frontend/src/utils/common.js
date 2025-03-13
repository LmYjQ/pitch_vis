// 音符名称数组
const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// 将频率转换为音符名称
export function frequencyToNote(frequency, standardA) {
  if (!frequency) return "";

  // 计算与A4（标准音A）的半音差
  const a4 = standardA || 440; // A4频率
  // const semitoneRatio = Math.pow(2, 1 / 12)

  // 计算与A4的半音数差异
  const semitonesFromA4 = Math.round(12 * Math.log2(frequency / a4));

  // 计算音高名称和八度
  const octave = Math.floor((semitonesFromA4 + 9) / 12) + 4; // A4的9是从C0开始的偏移
  const noteIndex = (semitonesFromA4 + 9) % 12; // 加9是为了从C开始

  // 获取音符名称
  const noteName = noteNames[noteIndex >= 0 ? noteIndex : noteIndex + 12];

  return `${noteName}${octave}`;
}
