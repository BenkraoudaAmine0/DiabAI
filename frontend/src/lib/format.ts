export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDateTime(iso: string | null, lang: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(lang === "fr" ? "fr-FR" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
