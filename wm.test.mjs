import { expect, test } from "bun:test";
import { cleanTextFingerprint } from "./text-cleaner.mjs";
import { cleanAndSign, decodeHidden } from "./wm.mjs";

const prompt = JSON.stringify({
  title: "Mysterious Woman with Mask",
  composition: "Bust close-up crop.",
  fidelity_anchors: ["Red iris"],
  negative_prompt: ["cluttered background, watermark, logo, text"],
});

test("removes Gemini span links and markers before signing", () => {
  const dirty = `[](start_span)${prompt}span_0span_0[](end_span)[](start_span_3)`;
  const { signed, removed } = cleanAndSign(dirty, "t1");

  expect(signed).not.toContain("start_span");
  expect(signed).not.toContain("end_span");
  expect(signed).not.toContain("span_0");
  expect(removed).toEqual([
    { kind: "span-link", count: 3 },
    { kind: "span-marker", count: 2 },
  ]);
  expect(() => JSON.parse(signed)).not.toThrow();
});

test("adds the visible signature clauses and a decodable hidden ID", () => {
  const { signed } = cleanAndSign(prompt, "fawkes");
  const parsed = JSON.parse(signed);

  expect(parsed.fidelity_anchors.at(-1)).toContain('"@croissmouse"');
  expect(parsed.composition).toContain('"@croissmouse"');
  expect(parsed.negative_prompt[0]).toContain('any text other than the small "@croissmouse" signature');
  expect(decodeHidden(signed)).toEqual(["croissmouse:fawkes"]);
});

test("hidden ID survives a second pass through the deartifi cleaner", () => {
  const { signed } = cleanAndSign(prompt, "fawkes");
  expect(decodeHidden(cleanTextFingerprint(signed).text)).toEqual(["croissmouse:fawkes"]);
});

test("still decodes IDs written with the legacy scheme", () => {
  const legacy = "Mysterious\u2060" +
    [...new TextEncoder().encode("croissmouse:old")]
      .map((b) => b.toString(2).padStart(8, "0"))
      .join("")
      .replace(/0/g, "\u200B")
      .replace(/1/g, "\u200C") +
    "\u2060 Woman";
  expect(decodeHidden(legacy)).toEqual(["croissmouse:old"]);
});
