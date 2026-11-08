# signer

Fork of prompt-signer without the visible signature. Live at https://signer.sanguneo.com (GitHub Pages).

1. **Clean:** removes generator artifacts using the deartifi text-cleaner rules: hidden Unicode, bidi controls,
   `span_0` markers, and `[](start_span)` / `[](end_span)` links.
2. **Trace:** hides `<name>:<id>` (or just `<id>` when the name field is empty; the page remembers the name in this browser) in the title of a JSON prompt (after its first word), or after a random word in the middle of a plain-text prompt as invisible
   characters (ZWNJ/ZWJ between CGJ markers), so a copied prompt can be traced to its post. The ID survives a pass
   through the deartifi cleaner. IDs written by the original tool (`croissmouse:<id>`) still decode. No signature clause is added to the prompt.

Everything runs in the browser; the page sends nothing anywhere.

## Files

- `index.html`: the static page (GitHub Pages serves it as is).
- `signer.mjs`, `text-cleaner.mjs`: shared logic for the page and the CLI.
- `wm.mjs`: Bun CLI (`bun wm.mjs sign [in] [out] --id x`, `bun wm.mjs decode [file-or-text]`).

```sh
bun test
```
