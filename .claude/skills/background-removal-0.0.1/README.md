# Background Removal

Removes image backgrounds by detecting the background color and applying smooth alpha blending. Produces soft, feathered edges instead of harsh cutouts.

## Tags

`image-editing`

## Usage

Use when the user wants to remove a background from a logo, product shot, or portrait. Works best on images with solid or near-solid backgrounds.

## Setup

- Node.js 20+
- `sharp` package

## Script

```bash
node .cursor/skills/background-removal/scripts/remove-background.js <input> [output] [--feather N] [--low N] [--high N]
```

Output: PNG with alpha channel. Default: `<input>-no-bg.png`
