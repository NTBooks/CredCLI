---
name: generate-images
description: Generates and edits images using Gemini Nano Banana Pro (gemini-3-pro-image-preview). Use when the user wants to create, generate, produce, or modify images from descriptions, brand assets, marketing visuals, or any image generation/editing request.
license: MIT
metadata:
  author: TutorialGuy
  version: "0.0.1"
  tags: image-editing
---

# Generate and Edit Images with Gemini Nano Banana Pro

## Overview

This skill generates images from text prompts and edits existing images using Google's Gemini 3 Pro Image model (Nano Banana Pro). Output images are saved to the `gen-images` folder at the project root.

## When to Use

- User asks to generate, create, or produce an image from a description
- User wants to **modify an existing image** (e.g., change colors, text, background)
- User provides an image and asks for edits or variations
- User wants brand images, marketing visuals, or design mockups

## Workflow

1. **Ensure setup**: Verify `@google/genai` is installed and `GEMINI_API_KEY` is in `.env`
2. **Choose mode**:
   - **Generate**: Pass a text prompt only
   - **Edit**: Pass an image path + edit instructions
3. **Output**: Images are saved to `gen-images/` with timestamped filenames

## Generate Script (text-to-image)

**Location**: `.cursor/skills/generate-images/scripts/generate-image.js`

**Usage**:
```bash
node .cursor/skills/generate-images/scripts/generate-image.js "Your image prompt here"
```

**Example**:
```bash
node .cursor/skills/generate-images/scripts/generate-image.js "A minimalist logo for a coffee shop with warm brown tones"
```

## Edit Script (image-to-image)

**Location**: `.cursor/skills/generate-images/scripts/edit-image.js`

**Usage**:
```bash
node .cursor/skills/generate-images/scripts/edit-image.js <image-path> "Your edit instructions"
```

**Example**:
```bash
node .cursor/skills/generate-images/scripts/edit-image.js logo.png "Change the text color to emerald green and use a pure white background"
```

**Example** (edit existing logo):
```bash
node .cursor/skills/generate-images/scripts/edit-image.js "assets/my-logo.png" "Make the text emerald green, keep only emerald green and gold colors, pure white background"
```

## Requirements

- Node.js 20+
- `@google/genai` and `dotenv` packages
- `GEMINI_API_KEY` in `.env` (from Google AI Studio)

## Output

- Images saved to `gen-images/` folder
- Generate: `gen-YYYYMMDD-HHmmss.png`
- Edit: `edit-YYYYMMDD-HHmmss.png`
- Creates `gen-images` folder if it does not exist
