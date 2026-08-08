import type { PostState } from "../lib/types.js";
import { STATE_BADGE_CLASSES, STATE_LABELS } from "../lib/stateMachine.js";

export function StateBadge({ state }: { state: PostState }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATE_BADGE_CLASSES[state]}`}>
      {STATE_LABELS[state]}
    </span>
  );
}
