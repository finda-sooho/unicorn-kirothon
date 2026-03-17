type RoleTheme = {
  background: string;
  border: string;
  text: string;
};

const themes: Record<string, RoleTheme> = {
  po: {
    background: "rgba(45, 38, 64, 0.72)",
    border: "#b8a9e8",
    text: "#d5caf6",
  },
  be: {
    background: "rgba(30, 45, 61, 0.78)",
    border: "#7eb8d8",
    text: "#d3ecfb",
  },
  fe: {
    background: "rgba(30, 51, 50, 0.78)",
    border: "#6dc8b8",
    text: "#d4f7ef",
  },
  designer: {
    background: "rgba(61, 42, 42, 0.78)",
    border: "#e8a898",
    text: "#ffe1d6",
  },
  legal: {
    background: "rgba(42, 45, 53, 0.86)",
    border: "#a8b0c8",
    text: "#e0e6f7",
  },
  qa: {
    background: "rgba(42, 51, 37, 0.82)",
    border: "#a8d88e",
    text: "#e6f5d6",
  },
  default: {
    background: "rgba(36, 40, 54, 0.84)",
    border: "#60a5fa",
    text: "#dcebff",
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
