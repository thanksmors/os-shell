// ─── Concurrent-edit merge for id-keyed collections ───────────────────────────
//
// When two workspace members save the same document concurrently the server merges
// rather than overwrites. Algorithm: union id-keyed arrays from both versions;
// the newer document (by _ts) wins on same-id conflicts; items marked _del:true
// act as tombstones so concurrent delete+add resolves correctly.

// Collections whose top-level fields are id-keyed arrays to merge.
const TOP_ARRAYS = {
  'load-plans':    ['tasks', 'members'],
  'roadmaps':      ['projects', 'phases'],
  'pm-data':       ['folders', 'projects'],
  'boards':        ['cards', 'columns'],
  'chat':          ['channels'],
  'chat-messages': ['messages'],
};

// Collections with a nested map field whose values each contain id-keyed arrays.
// Non-array fields inside the map values (e.g. pm-data brief/roles objects)
// resolve whole-object last-write-wins from the newer doc.
const NESTED = {
  'pm-data': { mapField: 'projectData', subArrays: ['milestones', 'issues', 'actions', 'decisions', 'links'] },
};

/**
 * Merge `incoming` into `current` for the given collection.
 * Returns the merged document. If current has no _ts it is treated as empty
 * and incoming wins outright (first write, no history to merge).
 */
export function mergeDoc(current, incoming, collection) {
  if (!current || current._ts == null) return incoming;

  // Determine which document is the "base" (newer) and which is the "other" (older).
  // Base items win on same-id conflicts so that the most-recent intentional edit wins.
  const [base, other] = (incoming._ts ?? 0) >= (current._ts ?? 0)
    ? [incoming, current]
    : [current, incoming];

  const result = { ...base };

  // Merge top-level id-keyed arrays.
  for (const field of TOP_ARRAYS[collection] || []) {
    result[field] = _mergeArr(base[field] || [], other[field] || []);
  }

  // Merge nested map arrays (e.g. pm-data.projectData[pid].milestones).
  const nested = NESTED[collection];
  if (nested) {
    const baseMap  = base[nested.mapField]  || {};
    const otherMap = other[nested.mapField] || {};
    const allKeys  = new Set([...Object.keys(baseMap), ...Object.keys(otherMap)]);
    result[nested.mapField] = {};
    for (const pid of allKeys) {
      if (!baseMap[pid])  { result[nested.mapField][pid] = otherMap[pid]; continue; }
      if (!otherMap[pid]) { result[nested.mapField][pid] = baseMap[pid];  continue; }
      const merged = { ...baseMap[pid] };
      for (const sf of nested.subArrays) {
        merged[sf] = _mergeArr(baseMap[pid][sf] || [], otherMap[pid][sf] || []);
      }
      result[nested.mapField][pid] = merged;
    }
  }

  return result;
}

// Union two id-keyed arrays. Base items overwrite other items on id conflict
// (base is the newer document). Items with _del:true are stripped (tombstones).
function _mergeArr(base, other) {
  const map = new Map();
  for (const item of other) if (item?.id) map.set(item.id, item);
  for (const item of base)  if (item?.id) map.set(item.id, item); // base wins conflict
  return [...map.values()].filter(item => !item._del);
}
