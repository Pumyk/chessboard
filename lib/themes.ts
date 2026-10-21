// Board themes + display preferences. Stored locally (no account needed),
// applied by the Board component. Piece sets stay on the classic set.

export type Theme = { id: string; name: string; light: string; dark: string };

export const THEMES: Theme[] = [
  { id: "green", name: "Green", light: "#eeeed2", dark: "#769656" },
  { id: "brown", name: "Wood", light: "#f0d9b5", dark: "#b58863" },
  { id: "blue", name: "Ice", light: "#dee3e6", dark: "#8ca2ad" },
  { id: "gray", name: "Slate", light: "#d9d9d9", dark: "#a3a3a3" },
  { id: "purple", name: "Royal", light: "#e8e0f0", dark: "#8a6fb0" },
];

const DEFAULT_THEME = "green";

export function getThemeId(): string {
  if (typeof window === "undefined") return DEFAULT_THEME;
  return localStorage.getItem("cb-theme") ?? DEFAULT_THEME;
}

export function getTheme(): Theme {
  const id = getThemeId();
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

export function setThemeId(id: string) {
  localStorage.setItem("cb-theme", id);
}

export function getCoords(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("cb-coords") !== "off";
}

export function setCoords(on: boolean) {
  localStorage.setItem("cb-coords", on ? "on" : "off");
}

export function getSound(): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem("cb-sound") !== "off";
}

export function setSound(on: boolean) {
  localStorage.setItem("cb-sound", on ? "on" : "off");
}
