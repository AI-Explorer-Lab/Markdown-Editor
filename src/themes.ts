export const themes = [
  {
    id: "plain",
    name: "素白",
    description: "留白与细线，回归文字",
    accent: "#303b44",
    soft: "#f4f5f5",
    bg: "#ffffff",
  },
  {
    id: "ink",
    name: "墨书",
    description: "宋体墨色，书卷气息",
    accent: "#4f4b43",
    soft: "#f0ece3",
    bg: "#faf8f3",
  },
  {
    id: "sea",
    name: "海盐",
    description: "蓝色标签，清晰层次",
    accent: "#3185a8",
    soft: "#eaf5fb",
    bg: "#ffffff",
  },
  {
    id: "forest",
    name: "松林",
    description: "松绿细线，舒展阅读",
    accent: "#326342",
    soft: "#eef5ee",
    bg: "#ffffff",
  },
  {
    id: "clay",
    name: "赤陶",
    description: "暖色圆角，温柔叙事",
    accent: "#b0634c",
    soft: "#faf0e9",
    bg: "#fffcf8",
  },
  {
    id: "violet",
    name: "紫藤",
    description: "双线标题，精致专栏",
    accent: "#7b5a9b",
    soft: "#f2edf9",
    bg: "#ffffff",
  },
  {
    id: "amber",
    name: "琥珀",
    description: "色带标题，醒目重点",
    accent: "#a76810",
    soft: "#fff3d9",
    bg: "#fffefa",
  },
  {
    id: "geek",
    name: "极客",
    description: "终端标记，技术表达",
    accent: "#167b93",
    soft: "#eaf4f7",
    bg: "#ffffff",
  },
  {
    id: "press",
    name: "报刊",
    description: "居中黑白，经典社论",
    accent: "#222222",
    soft: "#f3f3f3",
    bg: "#ffffff",
  },
  {
    id: "night",
    name: "夜航",
    description: "深色纸面，安静阅读",
    accent: "#91cfd5",
    soft: "#29393f",
    bg: "#1e2a30",
  },
] as const;
export type ThemeId = (typeof themes)[number]["id"] | "blank";
const neutralTheme = {
  id: "blank",
  name: "自定义",
  accent: "#333333",
  soft: "#f5f5f5",
  bg: "#ffffff",
} as const;
export const isThemeId = (id: unknown): id is ThemeId =>
  id === "blank" || themes.some((t) => t.id === id);
export const themePreset = (id: ThemeId) =>
  themes.find((t) => t.id === id) || neutralTheme;
