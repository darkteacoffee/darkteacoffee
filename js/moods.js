// 心情档位。1 最差，5 最好。
export const MOODS = [
  { v: 5, emoji: '😄', label: '很好' },
  { v: 4, emoji: '🙂', label: '还行' },
  { v: 3, emoji: '😐', label: '一般' },
  { v: 2, emoji: '😔', label: '低落' },
  { v: 1, emoji: '😢', label: '难受' },
];

export function moodEmoji(v) {
  const m = MOODS.find((x) => x.v === Number(v));
  return m ? m.emoji : '';
}

export function moodLabel(v) {
  const m = MOODS.find((x) => x.v === Number(v));
  return m ? m.label : '';
}
