import type { DiffOp } from "../lib/types.js";

const OP_CLASSES: Record<DiffOp["type"], string> = {
  add: "bg-emerald-50 text-emerald-800",
  remove: "bg-red-50 text-red-800",
  context: "text-gray-500",
};

const OP_PREFIX: Record<DiffOp["type"], string> = {
  add: "+",
  remove: "-",
  context: " ",
};

export function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-gray-200 bg-white p-2 font-mono text-xs">
      {ops.map((op, opIndex) =>
        op.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line, lineIndex) => (
            <div key={`${opIndex}-${lineIndex}`} className={`whitespace-pre-wrap px-1 ${OP_CLASSES[op.type]}`}>
              {OP_PREFIX[op.type]} {line}
            </div>
          )),
      )}
    </div>
  );
}
