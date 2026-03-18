# Generate Images

Generates and edits images using Google's Gemini image model. Supports text-to-image generation and image-to-image editing.

## Tags

`image-editing`

## Usage

Use when the user wants to create, generate, or modify images. For branded content, reference [brand-guidelines](../brand-guidelines/) for colors and style.

## Setup

1. `@google/genai` and `dotenv` packages
2. `GEMINI_API_KEY` in `.env` (from Google AI Studio)

## Scripts

- **generate-image.js** — Text-to-image: `node .../generate-image.js "Your prompt"`
- **edit-image.js** — Image-to-image: `node .../edit-image.js <image-path> "Edit instructions"`

Output saved to `gen-images/` with timestamped filenames.
