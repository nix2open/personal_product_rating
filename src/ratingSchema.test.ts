import { describe, expect, it } from "vitest";
import { z } from "zod";

const ratingSchema = z.object({
  overall: z.number().int().min(0).max(10),
  price: z.number().int().min(0).max(10).nullable().optional(),
  quality: z.number().int().min(0).max(10).nullable().optional(),
});

describe("ratingSchema", () => {
  it("requires overall 0–10", () => {
    expect(ratingSchema.parse({ overall: 0 }).overall).toBe(0);
    expect(ratingSchema.parse({ overall: 10, price: null }).price).toBeNull();
  });
  it("rejects out of range", () => {
    expect(() => ratingSchema.parse({ overall: 11 })).toThrow();
  });
});
