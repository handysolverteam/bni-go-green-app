import { describe, expect, it } from "vitest";
import { buildRoleOrderUpdates, normalizeRoleName, sanitizeRoleName } from "../roles";

describe("normalizeRoleName", () => {
  it("trims whitespace, collapses spaces, and lowercases role names", () => {
    expect(normalizeRoleName("  Growth   Coordinator  ")).toBe("growth coordinator");
  });
});

describe("sanitizeRoleName", () => {
  it("preserves display casing while removing duplicate spaces", () => {
    expect(sanitizeRoleName("  Visitor   Host  ")).toBe("Visitor Host");
  });
});

describe("buildRoleOrderUpdates", () => {
  it("maps assignment ids to zero-based display order values", () => {
    expect(buildRoleOrderUpdates(["a", "b", "c"])).toEqual([
      { id: "a", display_order: 0 },
      { id: "b", display_order: 1 },
      { id: "c", display_order: 2 },
    ]);
  });
});
