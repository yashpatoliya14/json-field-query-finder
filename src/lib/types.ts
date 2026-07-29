export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface PathSegment {
  key: string | number;
  isIndex: boolean;
}

export type Range = [number, number];

export type MatchedOn = "key" | "value";

export interface MatchRecord {
  pathStr: string;
  path: PathSegment[];
  key: string | number;
  isIndex: boolean;
  value: JsonValue;
  valueType: string;
  matchedOn: MatchedOn[];
  keyRanges: Range[];
  valueRanges: Range[];
}

export type SearchMode = "both" | "keys" | "values";

export interface SearchOptions {
  mode: SearchMode;
  caseSensitive: boolean;
  regex: boolean;
}

export interface FindResult {
  matches: MatchRecord[];
  autoExpand: Set<string>;
  error: string | null;
}

export interface JsonStats {
  nodes: number;
  leaves: number;
  containers: number;
  maxDepth: number;
  sizeBytes: number;
}
