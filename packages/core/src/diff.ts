import { diffLines, type Change } from "diff";

export type DiffOp = { type: "add" | "remove" | "context"; value: string };

export function diffContent(oldText: string, newText: string): DiffOp[] {
  const changes: Change[] = diffLines(oldText, newText);
  return changes.map((c) => ({
    type: c.added ? "add" : c.removed ? "remove" : "context",
    value: c.value,
  }));
}
