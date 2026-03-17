type RoleTheme = {
  background: string;
  border: string;
  text: string;
};

// Branding Guide §2 — 역할별 컬러 (저채도 파스텔)
const themes: Record<string, RoleTheme> = {
  po: {
    background: "#2D2640",
    border: "rgba(184, 169, 232, 0.35)",
    text: "#B8A9E8",
  },
  be: {
    background: "#1E2D3D",
    border: "rgba(126, 184, 216, 0.35)",
    text: "#7EB8D8",
  },
  fe: {
    background: "#1E3332",
    border: "rgba(109, 200, 184, 0.35)",
    text: "#6DC8B8",
  },
  designer: {
    background: "#3D2A2A",
    border: "rgba(232, 168, 152, 0.35)",
    text: "#E8A898",
  },
  legal: {
    background: "#2A2D35",
    border: "rgba(168, 176, 200, 0.35)",
    text: "#A8B0C8",
  },
  qa: {
    background: "#2A3325",
    border: "rgba(168, 216, 142, 0.35)",
    text: "#A8D88E",
  },
  default: {
    background: "#1E2D3D",
    border: "rgba(126, 184, 216, 0.3)",
    text: "#7EB8D8",
  },
};

export function roleThemeKey(role: string) {
  const normalized = role.toLowerCase();

  if (
    normalized.includes("po") ||
    normalized.includes("pm") ||
    normalized.includes("product") ||
    normalized.includes("기획")
  ) {
    return "po";
  }

  if (
    normalized.includes("backend") ||
    normalized.includes("back-end") ||
    normalized.includes("be") ||
    normalized.includes("서버")
  ) {
    return "be";
  }

  if (
    normalized.includes("frontend") ||
    normalized.includes("front-end") ||
    normalized.includes("fe") ||
    normalized.includes("웹")
  ) {
    return "fe";
  }

  if (
    normalized.includes("design") ||
    normalized.includes("designer") ||
    normalized.includes("디자인")
  ) {
    return "designer";
  }

  if (
    normalized.includes("legal") ||
    normalized.includes("law") ||
    normalized.includes("법무")
  ) {
    return "legal";
  }

  if (
    normalized.includes("qa") ||
    normalized.includes("test") ||
    normalized.includes("품질")
  ) {
    return "qa";
  }

  return "default";
}

export function resolveRoleTheme(role: string): RoleTheme {
  return themes[roleThemeKey(role)] ?? themes.default;
}
