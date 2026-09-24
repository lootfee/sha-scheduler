export const BENCHES = [
  "Softlab DE",
  "Labware DE",
  "Low Vol DE",
  "Accession",
  "Tracking",
  "Mail",
  "Sorting",
  "Frozens Accession",
  "Frozens Data Entry",
  "Frozens Float",
  "CRC",
  "Float",
  "Holiday",
  "Customer Service",
] as const;

const COLORS = ["#2563eb", "#0f766e", "#7c3aed", "#4f46e5", "#6366f1", "#b45309", "#be123c", "#0891b2", "#64748b", "#15803d", "#ca8a04", "#b91c1c", "#c2410c", "#c2410c"];

export function benchColor(bench: string | null | undefined) {
  const index = BENCHES.findIndex((item) => item.toLowerCase() === (bench || "Float").toLowerCase());
  return COLORS[index < 0 ? COLORS.length - 1 : index];
}

export function benchShortName(bench: string | null | undefined) {
  const words = (bench || "Float").trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return `${words[0][0]}${words[1].slice(0, 2)}`.toUpperCase();
}
