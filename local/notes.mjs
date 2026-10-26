// Merges note lists by id; the newer edit wins. Deleted notes are kept as
// tombstones ({ id, deleted: true, updated }) so a stale tab can't revive them.
export function mergeNotes(current, incoming) {
  const byId = new Map(current.map((note) => [note.id, note]));
  for (const note of incoming) {
    if (typeof note?.id !== "string" || !Number.isFinite(note.updated))
      continue;
    const existing = byId.get(note.id);
    if (!existing || note.updated >= existing.updated) byId.set(note.id, note);
  }
  return [...byId.values()];
}
