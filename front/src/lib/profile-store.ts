"use client";

import type { CustomField } from "@/lib/types";

export type GlobalProfile = {
  role: string;
  expertise_areas: string[];
  knowledge_gaps: string[];
  custom_fields: CustomField[];
  updated_at: string | null;
};

const STORAGE_KEY = "mai-global-profile";

const emptyProfile: GlobalProfile = {
  role: "",
  expertise_areas: [],
  knowledge_gaps: [],
  custom_fields: [],
  updated_at: null,
};

export function loadGlobalProfile(): GlobalProfile {
  if (typeof window === "undefined") return emptyProfile;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProfile;
    return JSON.parse(raw) as GlobalProfile;
  } catch {
    return emptyProfile;
  }
}

export function saveGlobalProfile(profile: GlobalProfile): void {
  if (typeof window === "undefined") return;
  const next = { ...profile, updated_at: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}
