# Screenshot Drop Extension — Design

**Date:** 2026-07-04
**Status:** Draft for review

## Problem

When running Claude Code over a remote session (VS Code Remote or terminal SSH into
another machine), you cannot paste an image from the clipboard into Claude Code.
Claude Code needs a **file path** it can read on the machine it is running on.

Today, getting a screenshot to that machine is manual and slow: capture, save, copy
to the remote box, figure out the path, type it in.

## Two parts

1. **Extension** — installed in the browser on **Computer A** (Brave and Firefox).
2. **Receiving service** — a small server running on **Computer B** (Ubuntu Linux for
   now). It listens on the network, receives the image the extension sends, saves it to
   a folder, and returns the saved file's path.

## What we're building

The extension:

1. Captures a screenshot in one of three modes (see Capture modes).
2. Lets you draw basic annotations on it (arrows, boxes, lines, freehand).
3. Sends the annotated image to a **destination you configured** — each destination is a
   receiving service running on some Computer B.
4. Receives back the path where the service saved the file, and copies it to your
   clipboard (and shows it), so you paste it straight into Claude Code.

## Technology stack

Chosen so nothing is thrown away when this grows from an extension into a full desktop
screenshot app later.

- **Capture + annotation UI:** TypeScript + HTML `<canvas>`. Written as web code so the
  exact same drawing/annotation UI runs in the extension now and inside a desktop app's
  webview later.
- **Receiving service:** **Go**, compiled to a single static binary — trivial to run on
  Ubuntu under systemd, no runtime to install.
- **Future desktop app path:** **Wails** (Go backend + web frontend). When you build the
  full standalone program, the Go service logic and the web annotation UI both fold into
  it directly — no rewrite. (Rust + Tauri is the alternative; rejected as heavier to
  write for a web/JS-oriented setup.)

### The core flow

```
Computer A (browser)                    Computer B — Ubuntu (e.g. HCA-Worker-01)
─────────────────────                   ─────────────────────────────────────────
 snap tab                               receiving service listening, e.g. :9922
 draw arrows/boxes
 pick destination:  "HCA-Worker-01"
 click Save  ──── image over network ──▶ service saves it to its folder
                                          /home/hcadmin/screenshots/2026-07-04_login-bug.png
                 ◀──── returns path ─────
 clipboard + on-screen:
   /home/hcadmin/screenshots/2026-07-04_login-bug.png
        │
        └── paste into Claude Code running on Computer B  ✔
```

## Destinations (what you configure in the extension)

A **destination** is a saved entry pointing at a receiving service. Each has:

| Field | Example | Purpose |
|-------|---------|---------|
| Name | `HCA-Worker-01` | What you pick from the Save dropdown |
| Service address | `http://10.2.50.13:9922` | Where the extension sends the image |

You add destinations once. From then on, saving is: **snap → draw → pick destination →
Save.** The last-used destination is remembered and pre-selected. The folder the file
lands in is decided by the service on Computer B (configured there), so the path that
comes back is always correct for that machine.

## The receiving service (Computer B — Ubuntu)

A small server, one per receiving machine. Responsibilities:

- Listen on a configurable port (e.g. `9922`).
- Accept an uploaded image (plus optional short name) over HTTP.
- Save it into a configured folder (e.g. `/home/hcadmin/screenshots/`) with the
  generated filename.
- Respond with the **absolute path** of the saved file on that machine.

Kept deliberately small and dependency-light so it's trivial to run on Ubuntu (single
binary or a tiny script under systemd). Config it needs: listen port, save folder, and
an optional shared token so only your extension can post to it.

## Capture modes

Three modes, all in v1:

- **Full page** — the entire scrollable page, not just what's on screen. (Firefox has a
  native full-page capture API; in Chromium/Brave this is done by scroll-and-stitch or
  the debugger capture API — handled in the extension.)
- **Visible tab** — what's currently shown in the viewport. Fast, one shot.
- **Marked area** — you drag a rectangle over the page and only that region is captured.

After any mode, the image opens in the annotation view before Save.

## Networking scope & auth

- **LAN only** for now — services bind to the LAN interface, not exposed publicly.
- **Shared token:** each service generates a token; you paste it into that destination in
  the extension. The service rejects any request without the matching token.
- **Origin lockdown:** the service rejects cross-origin browser requests (only the
  extension may post), so a random web page in your browser can't reach it.
- No TLS certificates required on a closed LAN. (Can be added later if ever exposed.)

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
- Adding a new destination machine = run the small service on it + add one row in the
  extension.

## Decisions locked

- Stack: Go service (single binary) + TypeScript/canvas UI; Wails as the future
  desktop-app path.
- Capture: full page, visible tab, and marked area — all three in v1.
- Networking: LAN only, shared token + origin lockdown, no TLS for now.

## Open questions (for planning)

- None blocking. Remaining choices (systemd unit details, exact token storage in the
  extension, default port) are settled during the implementation plan.
```
