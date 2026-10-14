# prompt-signer

Signs image-generation prompts for @croissmouse.

1. **Clean:** removes generator artifacts using the deartifi text-cleaner rules: hidden Unicode, bidi controls,
   `span_0` markers, and `[](start_span)` / `[](end_span)` links.
2. **Sign:** adds clauses that make image models paint a small "@croissmouse" painter's signature in the
   lower-right corner of every image generated from the prompt.
3. **Trace:** hides `croissmouse:<id>` in the title as invisible characters (ZWNJ/ZWJ between CGJ markers),
   so a copied prompt can be traced to its post. The ID survives a pass through the deartifi cleaner.

## CLI (Bun)

```sh
bun wm.mjs sign                         # clipboard -> signed prompt back into the clipboard (auto ID)
bun wm.mjs sign --id fawkes             # same, with an explicit ID
bun wm.mjs sign in.json out.txt --id x  # file mode (JSON or plain-text prompts)
bun wm.mjs decode [file-or-text]        # find hidden IDs (clipboard by default)
```

The default ID is `YYYYMMDD-<first three title words>`.

## Web

```sh
bun web.mjs   # http://<tailscale-ip>:8787 (WM_PORT to change the port)
```

The server binds only to the machine's Tailscale IPv4 address.

## Test

```sh
bun test
```
