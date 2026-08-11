import type { DiffOp } from "../lib/types.js";

const OP_CLASSES: Record<DiffOp["type"], string> = {
  add: "bg-[rgba(30,105,70,0.06)] border-l-[3px] border-[rgba(30,105,70,0.45)] text-text-primary",
  remove: "bg-[rgba(193,58,25,0.06)] border-l-[3px] border-[rgba(193,58,25,0.5)] text-text-secondary",
  context: "border-l-[3px] border-transparent text-text-muted",
};

const OP_PREFIX: Record<DiffOp["type"], string> = {
  add: "+",
  remove: "-",
  context: " ",
};

export function DiffView({ ops }: { ops: DiffOp[] }) {
  return (
    <div className="overflow-hidden overflow-x-auto rounded-xl border border-border font-mono text-[13px] leading-relaxed">
      {ops.map((op, opIndex) =>
        op.value
          .replace(/\n$/, "")
          .split("\n")
          .map((line, lineIndex) => (
            <div key={`${opIndex}-${lineIndex}`} className={`whitespace-pre-wrap px-4 py-0.5 ${OP_CLASSES[op.type]}`}>
              {OP_PREFIX[op.type]} {line}
            </div>
          )),
      )}
    </div>
  );
}
