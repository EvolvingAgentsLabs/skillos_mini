# Vision cartridge — entry index

A vision call always starts with the same shape: a Recipe-supplied image (blackboard ref, data URI, or URL) plus a query. The cartridge picks a method based on what the caller asks:

- "describe this" / "what's in this photo" / "summarize the image" → [`describe`](describe.md)
- "find the X" / "where are the Y" / "list objects" → [`detect`](detect.md)
- "what does the text say" / "read the label" / "OCR" → [`read`](read.md)
- everything else (questions about the image) → [`answer`](answer.md)

The result is always text — JSON-shaped for `detect`, prose for the others — and it injects back into the calling Recipe's prompt as a standard `<|result|>...<|/result|>` block. The kernel never handles image tokens; the cartridge handles transport and translation.

If a Recipe needs vision but doesn't have a cloud allowance, the runtime routes to a local backend (LiteRT Gemma 4 E2B on Android, Moondream-2 in the browser). If that's not available either, the call fails closed — vision never silently becomes a cloud call.

See [MANIFEST.md](MANIFEST.md) for the full backend roster, routing rules, and current status.
