"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

export type ModelAvailability = Partial<Record<"diabetes" | "foot" | "neck" | "eye", boolean>>;

/** Which analysis models the server has installed (GET /api/health);
 *  null while loading or when the server can't be reached. */
export function useModelAvailability(): ModelAvailability | null {
  const [models, setModels] = useState<ModelAvailability | null>(null);
  useEffect(() => {
    api<{ models?: ModelAvailability }>("/api/health")
      .then((r) => setModels(r.models ?? {}))
      .catch(() => setModels(null));
  }, []);
  return models;
}
