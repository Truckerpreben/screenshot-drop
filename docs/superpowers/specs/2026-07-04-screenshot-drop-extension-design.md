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

Hard constraints, non-negotiable:

- **Nothing is mounted on Computer A.** No mounted drives, no mounted shares, no
  File-System-Access-into-a-mount. Computer A does not mount anything.
- **Nothing is installed on the receiving machine (Computer B)** beyond you enabling a
  shared folder on it, which you already do.

Within those constraints, the extension sends the image **directly over the network** to
the shared folder on Computer B (e.g. an SMB/network share you created on B) and writes
the file there. The destination and its path are what you configured for that location.

The exact wiring that lets the extension push bytes over the network (a small companion
that runs **on Computer A only**, speaking to B's share) is an implementation detail
decided in the plan. It never mounts anything and never touches Computer B.

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

1. Firefox vs. Brave: confirm both can drive the chosen network-push mechanism the same
   way (no mounting, no receiving-machine install in either).
2. Do you want capture of a selected region of the tab, or always the full visible tab?
```
