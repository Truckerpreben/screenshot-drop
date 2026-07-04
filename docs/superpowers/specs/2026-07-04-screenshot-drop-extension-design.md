# Screenshot Drop Extension — Design

**Date:** 2026-07-04
**Status:** Draft for review

## Problem

When running Claude Code over a remote session (VS Code Remote or terminal SSH into
another machine), you cannot paste an image from the clipboard into Claude Code.
Claude Code needs a **file path** it can read on the machine it is running on.

Today, getting a screenshot to that machine is manual and slow: capture, save, copy
to the remote box, figure out the path, type it in.

## What we're building

A browser extension (Brave and Firefox) that:

1. Captures a screenshot of the current browser tab.
2. Lets you draw basic annotations on it (arrows, boxes, lines, freehand).
3. Saves the annotated image to a **destination folder that lives on another
   computer** — chosen from a list you configured.
4. Builds the file's path **as seen on that destination computer**, and copies it to
   your clipboard (and shows it), so you paste it straight into Claude Code.

### The core flow (in the user's words)

> Extension goes on Computer A. In extension settings you add a location = a folder on
> Computer B (e.g. HCA-Worker-01). Take the screenshot, click Save — it saves the file
> on Computer B, then creates the path and copies / shows it.

```
Computer A (browser)                         Computer B (e.g. HCA-Worker-01)
─────────────────────                        ───────────────────────────────
 snap tab
 draw arrows/boxes
 pick destination:  "HCA-Worker-01"
 click Save  ───────────────────────────▶   file lands in the configured folder
                                             e.g. /home/hcadmin/screenshots/
 clipboard + on-screen:
   /home/hcadmin/screenshots/2026-07-04_login-bug.png
        │
        └── paste into Claude Code running on Computer B  ✔
```

## Storage locations (the one thing you configure)

A **location** is a saved entry in the extension. Each has:

| Field | Example | Purpose |
|-------|---------|---------|
| Name | `HCA-Worker-01` | What you pick from the Save dropdown |
| Destination | the folder on Computer B | Where the file is written |
| Path shown | `/home/hcadmin/screenshots` | Prefix used to build the path that gets copied |

You add locations once. From then on, saving is: **snap → draw → pick location → Save.**
The last-used location is remembered and pre-selected.

## How the file actually reaches Computer B (implementation — not a user concern)

A browser extension is sandboxed: it cannot open a raw network connection to another
machine and cannot write to an arbitrary disk path on its own. So "save to a folder on
Computer B" needs a real mechanism underneath. This is an **implementation choice made
at build time**, invisible in the user flow above. The realistic options, to be
decided in the implementation plan:

- **File System Access grant (Brave/Chromium):** you grant the extension a folder once;
  that folder is a network share already mounted on Computer A that points at Computer
  B. The extension writes into it; the OS moves the bytes. Firefox lacks this API and
  falls back to a Downloads-subfolder symlink.
- **Companion helper on Computer A:** a tiny native-messaging helper (installed only on
  the browser machine, not on the receiving machines) that receives the image from the
  extension and writes it to Computer B over the network (share, SCP, etc.).

Both deliver the exact flow above. The transport is picked during planning based on
which is least fragile across Brave + Firefox on your setup. **No software is required
on the receiving machines.**

## Annotation tools (scope)

Basic, fast, keyboard-friendly. In scope:

- Arrow, rectangle, line, freehand pen
- One or two colors (e.g. red default, plus one)
- Undo, and cancel/clear
- (Optional, low priority) text label

Out of scope for v1: blur/redact, cropping beyond the captured tab, multi-page, cloud
sync, image editing beyond the above.

## Filenames

- Auto-generated, sortable, human-readable: `YYYY-MM-DD_HH-MM-SS.png` by default.
- Optional: a short name field before saving, appended:
  `2026-07-04_14-22-08_login-bug.png`.
- PNG format.

## Success criteria

- From a tab, you can go snap → annotate → Save → paste-path into Claude Code in a few
  seconds.
- The pasted path is valid on the destination machine with no manual editing.
- Works in both Brave and Firefox.
- Adding a new destination machine is a small one-time config, with nothing installed on
  that machine.

## Open questions (for planning)

1. Transport mechanism (File System Access vs. companion helper) — pick per fragility.
2. Firefox parity: confirm the Downloads-subfolder fallback is acceptable, or require
   the companion helper on the browser machine for both browsers (more uniform).
3. Do you want capture of a selected region of the tab, or always the full visible tab?
```
