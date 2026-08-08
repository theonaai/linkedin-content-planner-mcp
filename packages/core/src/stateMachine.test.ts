import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, assertReviewTransition, InvalidStateTransitionError } from "./stateMachine.js";

describe("stateMachine", () => {
  it("allows the plain forward pipeline", () => {
    expect(canTransition("backlog", "todo")).toBe(true);
    expect(canTransition("todo", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "in_review")).toBe(true);
    expect(canTransition("ready", "posted")).toBe(true);
  });

  it("allows a few backward corrections", () => {
    expect(canTransition("todo", "backlog")).toBe(true);
    expect(canTransition("in_progress", "todo")).toBe(true);
    expect(canTransition("ready", "in_progress")).toBe(true);
  });

  it("blocks leaving in_review via the plain transition path", () => {
    expect(canTransition("in_review", "ready")).toBe(false);
    expect(canTransition("in_review", "in_progress")).toBe(false);
  });

  it("blocks skipping straight to ready or posted", () => {
    expect(canTransition("backlog", "ready")).toBe(false);
    expect(canTransition("todo", "posted")).toBe(false);
  });

  it("posted is terminal", () => {
    expect(canTransition("posted", "ready")).toBe(false);
    expect(canTransition("posted", "backlog")).toBe(false);
  });

  it("assertTransition throws on illegal moves", () => {
    expect(() => assertTransition("backlog", "ready")).toThrow(InvalidStateTransitionError);
  });

  it("review approval moves in_review -> ready", () => {
    expect(assertReviewTransition("in_review", "approved")).toBe("ready");
  });

  it("requesting changes moves in_review -> in_progress", () => {
    expect(assertReviewTransition("in_review", "changes_requested")).toBe("in_progress");
  });

  it("rejects a review decision when not in_review", () => {
    expect(() => assertReviewTransition("todo", "approved")).toThrow(InvalidStateTransitionError);
  });
});
