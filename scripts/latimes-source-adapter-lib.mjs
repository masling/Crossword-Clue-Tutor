const MONTHS = new Map([
  ["Jan", "01"], ["Feb", "02"], ["Mar", "03"], ["Apr", "04"],
  ["May", "05"], ["Jun", "06"], ["Jul", "07"], ["Aug", "08"],
  ["Sep", "09"], ["Oct", "10"], ["Nov", "11"], ["Dec", "12"]
]);

export function parseLatimesPicker(html) {
  const paramsText = String(html).match(/<script[^>]+id=["']params["'][^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if (!paramsText) return null;
  const params = JSON.parse(paramsText);
  const latest = params.streakInfo?.[0]?.puzzleDetails;
  if (!latest?.puzzleId || !latest.title) return null;
  const dateMatch = latest.title.match(/\b([A-Z][a-z]{2})\s+(\d{1,2}),\s+(\d{4})\b/);
  if (!dateMatch || !MONTHS.has(dateMatch[1])) return null;
  const [creator = null, editorPart = null] = String(latest.author ?? "").split(/\s+\/\s+Ed\.\s+/);
  const theme = latest.title.match(/-\s+["“](.+?)["”]\s*$/)?.[1] ?? null;
  return {
    sourceDate: `${dateMatch[3]}-${MONTHS.get(dateMatch[1])}-${dateMatch[2].padStart(2, "0")}`,
    sourceId: latest.puzzleId,
    title: latest.title,
    theme,
    creator: creator || null,
    editor: editorPart || null,
    gridWidth: latest.gridWidth ?? null,
    gridHeight: latest.gridHeight ?? null,
    officialClueCount: latest.numWords ?? null,
    publicationTimeZone: latest.publicationTimeZone ?? null
  };
}
