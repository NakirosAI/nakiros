import { describe, expect, it } from "vitest";

describe("test harness smoke", () => {
  it("runs basic assertions", () => {
    expect(1 + 1).toBe(2);
  });
});
