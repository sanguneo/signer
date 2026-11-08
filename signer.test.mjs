import { expect, test } from "bun:test";
import { cleanTextFingerprint } from "./text-cleaner.mjs";
import { cleanAndSign, decodeHidden, decodeUnique, signText } from "./signer.mjs";

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

test("hides a decodable ID without adding any visible signature", () => {
  const { signed } = cleanAndSign(prompt, "fawkes");
  const parsed = JSON.parse(signed);

  expect(signed).not.toContain("@croissmouse");
  expect(parsed.fidelity_anchors).toEqual(["Red iris"]);
  expect(parsed.composition).toBe("Bust close-up crop.");
  expect(parsed.negative_prompt).toEqual(["cluttered background, watermark, logo, text"]);
  expect(decodeHidden(signed)).toEqual(["fawkes"]);
});

test("plain-text prompts get only the hidden ID", () => {
  const { signed } = cleanAndSign("A quiet forest at dawn", "t2");
  expect(signed.replace(/[\u034F\u200C\u200D]/g, "")).toBe("A quiet forest at dawn\n");
  expect(decodeHidden(signed)).toEqual(["t2"]);
});

test("hidden ID survives a second pass through the deartifi cleaner", () => {
  const { signed } = cleanAndSign(prompt, "fawkes");
  expect(decodeHidden(cleanTextFingerprint(signed).text)).toEqual(["fawkes"]);
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

test("plain-text IDs land after the word the random pick chooses", () => {
  const first = signText("one two three four", "x", () => 0);
  const last = signText("one two three four", "x", () => 0.99);
  expect(first.indexOf("\u034F")).toBe(3);
  expect(last.indexOf("\u034F")).toBe("one two three".length);
  expect(decodeHidden(last)).toEqual(["x"]);
});

test("every section of a sectioned prompt carries the ID, so one copied section still decodes", () => {
  const prompt = "[Identity Lock - keep the face]\nUse the attached image only as reference.\n[Layer 5: Skin]\nReal skin texture under natural light.\n\nLast paragraph here.";
  const signed = signText(prompt, "me:p9", () => 0.5);
  expect(signed.replace(/[\u034F\u200C\u200D]/g, "")).toBe(prompt + "\n");
  expect(decodeHidden(signed)).toHaveLength(3);
  const section = signed.split("\n[Layer 5")[0];
  expect(decodeUnique(section)).toEqual(["me:p9"]);
});
