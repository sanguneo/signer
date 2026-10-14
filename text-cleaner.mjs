// Ported from sanguneo/deartifi src/text-cleaner.js (working tree after commit a3518dd),
// plus removal of empty Markdown span links such as `[](start_span)` / `[](end_span)`.
const inRange = (codePoint, start, end) =>
  codePoint >= start && codePoint <= end;

const isConjoiningJamo = (codePoint) =>
  inRange(codePoint, 0x1100, 0x115e) ||
  inRange(codePoint, 0x1161, 0x11ff) ||
  inRange(codePoint, 0xa960, 0xa97c) ||
  inRange(codePoint, 0xd7b0, 0xd7fb);

const isCompatibilityJamo = (codePoint) => inRange(codePoint, 0x3131, 0x318e);

const isHalfwidthJamo = (codePoint) => inRange(codePoint, 0xffa1, 0xffdc);

const isMongolianLetter = (codePoint) => inRange(codePoint, 0x1820, 0x1878);

const isAdjacentTo = (isNeighbour, previous, next) =>
  isNeighbour(previous) || isNeighbour(next);

const RULES = [
  {
    kind: "zero-width",
    matches: (codePoint) =>
      codePoint === 0x180e ||
      codePoint === 0x200b ||
      codePoint === 0x2060 ||
      codePoint === 0xfeff,
    replacement: "",
  },
  {
    kind: "soft-hyphen",
    matches: (codePoint) => codePoint === 0x00ad,
    replacement: "",
  },
  {
    kind: "bidi-control",
    matches: (codePoint) =>
      codePoint === 0x061c ||
      codePoint === 0x200e ||
      codePoint === 0x200f ||
      (codePoint >= 0x202a && codePoint <= 0x202e) ||
      (codePoint >= 0x2066 && codePoint <= 0x2069),
    replacement: "",
  },
  {
    kind: "unicode-tag",
    matches: (codePoint) => codePoint >= 0xe0000 && codePoint <= 0xe007f,
    replacement: "",
  },
  {
    // Blank-rendering fillers whose Unicode category (Lo) hides them from any
    // Cf-based scrub. Kept when adjacent to a jamo of their own presentation
    // form, because there they carry a partial Hangul syllable.
    kind: "hangul-filler",
    matches: (codePoint, previous, next) => {
      if (codePoint === 0x115f || codePoint === 0x1160) {
        return !isAdjacentTo(isConjoiningJamo, previous, next);
      }
      if (codePoint === 0x3164) {
        return !isAdjacentTo(isCompatibilityJamo, previous, next);
      }
      if (codePoint === 0xffa0) {
        return !isAdjacentTo(isHalfwidthJamo, previous, next);
      }
      return false;
    },
    replacement: "",
  },
  {
    // Mongolian free variation selectors only mean something after a Mongolian
    // letter; anywhere else they are invisible payload.
    kind: "mongolian-variation-selector",
    matches: (codePoint, previous) =>
      (inRange(codePoint, 0x180b, 0x180d) || codePoint === 0x180f) &&
      !isMongolianLetter(previous),
    replacement: "",
  },
  {
    // Unassigned code points carrying Other_Default_Ignorable_Code_Point=Yes:
    // conformant renderers draw nothing and normalization preserves them.
    kind: "reserved-ignorable",
    matches: (codePoint) =>
      codePoint === 0x2065 ||
      inRange(codePoint, 0xfff0, 0xfff8) ||
      inRange(codePoint, 0xe0080, 0xe00ff) ||
      inRange(codePoint, 0xe01f0, 0xe0fff),
    replacement: "",
  },
  {
    kind: "exotic-space",
    matches: (codePoint) =>
      codePoint === 0x00a0 ||
      codePoint === 0x1680 ||
      (codePoint >= 0x2000 && codePoint <= 0x200a) ||
      codePoint === 0x202f ||
      codePoint === 0x205f ||
      codePoint === 0x3000,
    replacement: " ",
  },
];

export const cleanTextFingerprint = (input) => {
  const codePoints = [...input].map((character) => character.codePointAt(0));
  const counts = new Map();
  const output = [];

  for (let index = 0; index < codePoints.length; index += 1) {
    const codePoint = codePoints[index];
    const rule = RULES.find((candidate) =>
      candidate.matches(codePoint, codePoints[index - 1], codePoints[index + 1]),
    );
    if (rule === undefined) {
      output.push(String.fromCodePoint(codePoint));
      continue;
    }
    counts.set(rule.kind, (counts.get(rule.kind) ?? 0) + 1);
    output.push(rule.replacement);
  }

  const unicodeCleanedText = output.join("").normalize("NFC");
  // Some upstream text extraction surfaces leak literal annotation markers
  // such as `span_0span_0` into copied prompts. They are not part of the
  // prompt and should be removed wherever they occur.
  // Gemini also leaks empty Markdown links around cited spans: `[](start_span)`, `[](end_span)`.
  const spanLinkPattern = /\[\]\((?:start|end)_span(?:_?\d+)?\)/g;
  const spanLinks = unicodeCleanedText.match(spanLinkPattern) ?? [];
  const withoutLinks = unicodeCleanedText.replace(spanLinkPattern, "");
  const spanMarkerPattern = /span_\d+/g;
  const spanMarkers = withoutLinks.match(spanMarkerPattern) ?? [];
  const text = withoutLinks.replace(spanMarkerPattern, "");
  const removed = RULES.flatMap((rule) => {
    const count = counts.get(rule.kind) ?? 0;
    return count === 0 ? [] : [{ kind: rule.kind, count }];
  });
  if (spanLinks.length > 0) {
    removed.push({ kind: "span-link", count: spanLinks.length });
  }
  if (spanMarkers.length > 0) {
    removed.push({ kind: "span-marker", count: spanMarkers.length });
  }

  return {
    text,
    removed,
    changed: text !== input,
  };
};
