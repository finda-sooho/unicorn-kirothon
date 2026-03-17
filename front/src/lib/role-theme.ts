type RoleTheme = {
  background: string;
  border: string;
  text: string;
};

const themes: Record<string, RoleTheme> = {
  po: {
    background: "rgba(124, 58, 237, 0.12)",
    border: "rgba(167, 139, 250, 0.4)",
    text: "#c4b5fd",
  },
  be: {
    background: "rgba(59, 130, 246, 0.1)",
    border: "rgba(96, 165, 250, 0.4)",
    text: "#93c5fd",
  },
  fe: {
    background: "rgba(20, 184, 166, 0.1)",
    border: "rgba(45, 212, 191, 0.4)",
    text: "#5eead4",
  },
  designer: {
    background: "rgba(244, 63, 94, 0.1)",
    border: "rgba(251, 113, 133, 0.4)",
    text: "#fda4af",
  },
  legal: {
    background: "rgba(100, 116, 139, 0.12)",
    border: "rgba(148, 163, 184, 0.4)",
    text: "#cbd5e1",
  },
  qa: {
    background: "rgba(34, 197, 94, 0.1)",
    border: "rgba(74, 222, 128, 0.4)",
    text: "#86efac",
  },
  default: {
    background: "rgba(96, 165, 250, 0.1)",
    border: "rgba(96, 165, 250, 0.35)",
    text: "#93c5fd",
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
