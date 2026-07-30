import type { SearchOptions, MatchRecord, Range } from "./types";

interface FlatNodeRow {
  pathStr: string;
  key: string;
  value: string;
  valueType: string;
  isIndex: number;
}

/**
 * Attempts to parse a MongoDB-style query object, e.g. { age: { $gt: 20 } }
 * Returns null if the query is not wrapped in braces or fails to parse as an object.
 */
export function parseMongoQuery(text: string): Record<string, any> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    const fn = new Function(`return (${trimmed});`);
    const val = fn();
    if (val && typeof val === "object" && !Array.isArray(val)) {
      return val;
    }
    return null;
  } catch {
    return null; // Fall back to simple text/regex search on parse failure
  }
}

/**
 * Translates a search term (or parsed MongoDB query) into a DuckDB SQL WHERE clause.
 */
export function buildSearchSql(query: string, opts: SearchOptions): { sql: string; isMongo: boolean; error: string | null } {
  const trimmed = query.trim();
  const mongoQuery = parseMongoQuery(trimmed);

  if (mongoQuery) {
    try {
      const sqlParts: string[] = [];
      for (const [key, value] of Object.entries(mongoQuery)) {
        // Dot notation matching: user.name -> pathStr REGEXP '\.user\.name$'
        // Escaping dots for regex path matching
        const escapedKey = key.replace(/\./g, "\\.");
        const pathCondition = `pathStr REGEXP '\\\\.${escapedKey}$'`;

        if (value instanceof RegExp) {
          const pattern = value.source;
          const flags = value.flags;
          const ignoreCase = flags.includes("i") ? "(?i)" : "";
          sqlParts.push(`(${pathCondition} AND value REGEXP '${ignoreCase}${pattern}')`);
        } else if (value && typeof value === "object" && !Array.isArray(value)) {
          // Operator object, e.g. { $gt: 20 } or { $regex: 'alice', $options: 'i' }
          const opParts: string[] = [];
          for (const [op, val] of Object.entries(value)) {
            if (op === "$regex") {
              const options = (value as any).$options || "";
              const ignoreCase = options.includes("i") ? "(?i)" : "";
              opParts.push(`value REGEXP '${ignoreCase}${val}'`);
            } else if (op === "$options") {
              continue;
            } else {
              // $gt, $gte, $lt, $lte, $ne, $eq
              let sqlOp = "=";
              if (op === "$gt") sqlOp = ">";
              else if (op === "$gte") sqlOp = ">=";
              else if (op === "$lt") sqlOp = "<";
              else if (op === "$lte") sqlOp = "<=";
              else if (op === "$ne") sqlOp = "!=";

              if (typeof val === "number") {
                opParts.push(`TRY_CAST(value AS DOUBLE) ${sqlOp} ${val}`);
              } else {
                const escapedVal = String(val).replace(/'/g, "''");
                opParts.push(`value ${sqlOp} '${escapedVal}'`);
              }
            }
          }
          if (opParts.length > 0) {
            sqlParts.push(`(${pathCondition} AND ${opParts.join(" AND ")})`);
          }
        } else {
          // Primitive exact match
          const escapedVal = String(value).replace(/'/g, "''");
          sqlParts.push(`(${pathCondition} AND value = '${escapedVal}')`);
        }
      }

      if (sqlParts.length === 0) {
        return { sql: "1=0", isMongo: true, error: "Empty query object" };
      }
      return { sql: sqlParts.join(" AND "), isMongo: true, error: null };
    } catch (err) {
      return { sql: "1=0", isMongo: true, error: (err as Error).message };
    }
  }

  // Fall back to standard SQL search (using REGEXP or LIKE)
  const escapedQuery = trimmed.replace(/'/g, "''");

  if (opts.regex) {
    const ignoreCase = opts.caseSensitive ? "" : "(?i)";
    const keyMatch = `key REGEXP '${ignoreCase}${escapedQuery}'`;
    const valueMatch = `value REGEXP '${ignoreCase}${escapedQuery}'`;

    if (opts.mode === "keys") return { sql: keyMatch, isMongo: false, error: null };
    if (opts.mode === "values") return { sql: valueMatch, isMongo: false, error: null };
    return { sql: `(${keyMatch} OR ${valueMatch})`, isMongo: false, error: null };
  } else {
    // Substring match using ILIKE (case-insensitive) or LIKE (case-sensitive)
    const op = opts.caseSensitive ? "LIKE" : "ILIKE";
    const keyMatch = `key ${op} '%${escapedQuery}%'`;
    const valueMatch = `value ${op} '%${escapedQuery}%'`;

    if (opts.mode === "keys") return { sql: keyMatch, isMongo: false, error: null };
    if (opts.mode === "values") return { sql: valueMatch, isMongo: false, error: null };
    return { sql: `(${keyMatch} OR ${valueMatch})`, isMongo: false, error: null };
  }
}

/**
 * Extracts highlighting match ranges inside Javascript.
 */
function getHighlightRanges(text: string, query: string, opts: SearchOptions): Range[] {
  if (!query) return [];
  if (opts.regex) {
    try {
      const re = new RegExp(query, opts.caseSensitive ? "g" : "gi");
      const ranges: Range[] = [];
      let m: RegExpExecArray | null;
      let guard = 0;
      while ((m = re.exec(text)) && guard < 100) {
        guard++;
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        ranges.push([m.index, m.index + m[0].length]);
      }
      return ranges;
    } catch {
      return [];
    }
  }
  const hay = opts.caseSensitive ? text : text.toLowerCase();
  const q = opts.caseSensitive ? query : query.toLowerCase();
  const ranges: Range[] = [];
  let idx = 0;
  while (true) {
    const found = hay.indexOf(q, idx);
    if (found === -1) break;
    ranges.push([found, found + q.length]);
    idx = found + q.length;
  }
  return ranges;
}

/**
 * Maps the flat rows returned from DuckDB back into our MatchRecord format.
 */
export function mapDuckDbRowsToMatches(
  rows: FlatNodeRow[],
  queryText: string,
  opts: SearchOptions
): { matches: MatchRecord[]; autoExpand: Set<string> } {
  const matches: MatchRecord[] = [];
  const autoExpand = new Set<string>();

  const isMongo = parseMongoQuery(queryText.trim()) !== null;

  for (const r of rows) {
    const isIndex = Boolean(r.isIndex);
    const key = isIndex ? Number(r.key) : r.key;

    // Convert values back to native JS types
    let nativeValue: any = r.value;
    if (r.valueType === "number") {
      nativeValue = Number(r.value);
    } else if (r.valueType === "boolean") {
      nativeValue = r.value === "true";
    } else if (r.valueType === "null") {
      nativeValue = null;
    }

    // Determine what matched
    const matchedOn: MatchRecord["matchedOn"] = [];
    let keyRanges: Range[] = [];
    let valueRanges: Range[] = [];

    if (isMongo) {
      // In Mongo mode, both the key path and value are highlighted normally
      matchedOn.push("value");
    } else {
      if (opts.mode !== "values") {
        const kr = getHighlightRanges(String(key), queryText, opts);
        if (kr.length > 0) {
          matchedOn.push("key");
          keyRanges = kr;
        }
      }
      if (opts.mode !== "keys" && r.valueType !== "object" && r.valueType !== "array") {
        const vr = getHighlightRanges(r.value, queryText, opts);
        if (vr.length > 0) {
          matchedOn.push("value");
          valueRanges = vr;
        }
      }
    }

    if (matchedOn.length === 0 && !isMongo) {
      matchedOn.push("value");
    }

    matches.push({
      pathStr: r.pathStr,
      path: [], // populated lazily or left empty as not needed for virtual list
      key,
      isIndex,
      value: nativeValue,
      valueType: r.valueType,
      matchedOn,
      keyRanges,
      valueRanges,
    });

    // Populate autoExpand paths
    autoExpand.add("$");
    let pStr = r.pathStr;
    // Ancestors can be collected:
    // e.g. "$[0].details.user" -> "$", "$[0]", "$[0].details"
    let i = 1;
    while (i < pStr.length) {
      if (pStr[i] === ".") {
        const nextDot = pStr.indexOf(".", i + 1);
        const nextBracket = pStr.indexOf("[", i + 1);
        let next = -1;
        if (nextDot !== -1 && nextBracket !== -1) next = Math.min(nextDot, nextBracket);
        else next = nextDot !== -1 ? nextDot : nextBracket;

        if (next === -1) break;
        autoExpand.add(pStr.substring(0, next));
        i = next;
      } else if (pStr[i] === "[") {
        const close = pStr.indexOf("]", i + 1);
        if (close === -1) break;
        autoExpand.add(pStr.substring(0, close + 1));
        i = close + 1;
      } else {
        i++;
      }
    }
  }

  return { matches, autoExpand };
}
