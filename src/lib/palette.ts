/**
 * 카테고리·태그용 프리셋 팔레트.
 * 실제 색 값은 globals.css의 --c-* 변수에 있고, 라이트/다크 모드에서 각각 조정된다.
 */
export const COLOR_KEYS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
] as const;

export type ColorKey = (typeof COLOR_KEYS)[number];

export const COLOR_LABELS: Record<ColorKey, string> = {
  gray: "회색",
  red: "빨강",
  orange: "주황",
  amber: "노랑",
  green: "초록",
  teal: "청록",
  blue: "파랑",
  indigo: "남색",
  purple: "보라",
  pink: "분홍",
};

export function colorVar(key: ColorKey | null | undefined): string {
  return `var(--c-${key ?? "gray"})`;
}

export function isColorKey(value: unknown): value is ColorKey {
  return typeof value === "string" && (COLOR_KEYS as readonly string[]).includes(value);
}
