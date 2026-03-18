---
name: background-removal
description: Removes image backgrounds by detecting the background color and creating smooth, blended transparency. Produces soft edges without rough halos. Use for logos, product shots, or any image on a solid or near-solid background.
license: MIT
metadata:
  author: TutorialGuy
  version: "0.0.1"
  tags: image-editing
---

# Background Removal

## Overview

Removes the background from images by automatically detecting the background color (from corners and edges) and applying smooth alpha blending. Produces soft, feathered edges instead of harsh cutouts.

## When to Use

- User wants to remove a background from an image (logo, product, portrait)
- Existing removal has rough white edges or halos
- Need transparent PNG for overlays, compositing, or logo replacement

## How It Works

1. **Detect background color** — Samples corners and edge pixels to find the dominant background color
2. **Compute alpha** — For each pixel, uses color distance to background with smooth falloff (smoothstep)
3. **Feather edges** — Applies slight blur to the alpha channel for blended transparency

## Script

**Location**: `.cursor/skills/background-removal/scripts/remove-background.js`

**Usage**:
```bash
node .cursor/skills/background-removal/scripts/remove-background.js <input> [output] [options]
```

| Option | Description |
|--------|-------------|
| `--sample <N>` | Pixels to sample from each edge for background detection (default: 15) |
| `--low <N>` | Low distance threshold for alpha (0–100, default: 5). Pixels closer to bg start fading. |
| `--high <N>` | High distance threshold for alpha (0–100, default: 35). Pixels farther are fully opaque. |
| `--feather <N>` | Sigma for alpha channel blur, in pixels (default: 1.5). Higher = softer edges. |

**Examples**:
```bash
node .cursor/skills/background-removal/scripts/remove-background.js logo.jpg logo-transparent.png
node .cursor/skills/background-removal/scripts/remove-background.js assets/logo.jpg --feather 2
```

## Output

- Writes PNG with alpha channel
- Default output: `<input>-no-bg.png` if no output path given

## Requirements

- Node.js 20+
- `sharp` package

## Cross-Reference

- Logo overlay: [logo-replacement](../logo-replacement/SKILL.md) uses this skill for transparent logos when installed as sibling
