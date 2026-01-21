# Bookboard

A visual planning tool for novelists. Import your manuscript, extract characters, themes, locations and scenes using AI, then organise everything on a digital corkboard.

## Features

- **Project Library**: Manage multiple novels or story collections from a single interface
- **Chapter Timeline**: Import your manuscript and see chapters/sections in order. Drag to reorder.
- **Chapter Editor**: Click any chapter to edit its content in a distraction-free writing view with live word count
- **Free-form Corkboard**: Pin cards for characters, themes, locations, scenes, and ideas. Drag them anywhere.
- **AI Extraction**: Use Gemini to automatically extract characters, themes, locations, and scenes from your manuscript
- **Import/Export**: 
  - Import Markdown manuscripts or JSON project files
  - Export your manuscript (full text in chapter order)
  - Export your bible (characters, themes, etc.)
  - Export JSON for backup/restore
- **Auto-save**: Everything saves to your browser's localStorage automatically
- **Debug Mode**: Enable logging to troubleshoot extraction issues
- **No backend**: Pure client-side. Your data never leaves your browser (API calls go direct to Google)

## Quick Start

1. Open `index.html` in your browser (or visit your GitHub Pages URL)
2. Click **New Project** or **Import** a Markdown/JSON file
3. Configure your Gemini API key in **Settings**
4. Click **Extract** to automatically identify characters, themes, locations, and scenes
5. Drag cards around the corkboard to organise
6. Click any chapter in the timeline to edit its content
7. Click **Export** to save your manuscript, bible, or project backup

## Hosting on GitHub Pages

1. Fork or clone this repository
2. Enable GitHub Pages in your repo settings (Settings → Pages → Source: main branch)
3. Access at `https://yourusername.github.io/bookboard/`

## Markdown Import Format

The importer treats `#` as the book title and `##` as chapter/section headers. Everything between headers becomes chapter content.

```markdown
# My Novel Title

## Chapter One: The Beginning

It was a dark and stormy night. The detective paced his office,
chain-smoking and muttering about the case.

## Chapter Two: The Discovery

The body was found at dawn...
```

If your document only uses `#` headers (no `##`), they'll be treated as chapters instead.

### Short Story Collections

The same format works for story collections—each `##` header becomes a story:

```markdown
# Tales of the Unexpected

## The Landlady

Billy Weaver had travelled down from London...

## The Way Up to Heaven

All her life, Mrs Foster had had an almost pathological fear...
```

## JSON Format (Project Schema)

For full round-trip fidelity, use JSON. This is the format used when you export a project.

```json
{
  "id": "proj-abc123",
  "title": "My Novel",
  "createdAt": "2025-01-15T10:00:00.000Z",
  "updatedAt": "2025-01-18T14:30:00.000Z",
  "chapters": [
    {
      "id": "ch-1",
      "title": "Chapter One: The Beginning",
      "content": "It was a dark and stormy night...",
      "order": 1
    }
  ],
  "entities": [
    {
      "id": "ent-1",
      "type": "character",
      "name": "Detective Morris",
      "description": "World-weary private eye. Ex-cop. Drinks too much.",
      "chapterRefs": ["ch-1", "ch-2"],
      "position": { "x": 150, "y": 100 }
    },
    {
      "id": "ent-2",
      "type": "theme",
      "name": "Institutional Corruption",
      "description": "The rot runs deeper than any individual.",
      "chapterRefs": [],
      "position": { "x": 400, "y": 100 }
    }
  ]
}
```

### Entity Types

- `character` - People in your story
- `theme` - Recurring ideas or motifs
- `location` - Places and settings
- `scene` - Key dramatic moments (at least one per chapter)
- `idea` - Freeform notes

## AI Extraction

Click the **Extract** button in the editor toolbar to use Gemini AI to automatically identify:

- **Scenes** - At least one per chapter, capturing key action or developments
- **Characters** - People mentioned by name with descriptions
- **Locations** - Places and settings
- **Themes** - Recurring ideas or motifs

### How It Works

- Documents under 200KB are processed in a single API request
- Larger documents are automatically chunked (3 chapters at a time) to avoid token limits
- If a single request hits Gemini's token limit, extraction automatically retries with chunking
- Duplicate entities across chunks are merged (e.g., same character appearing in multiple chapters)
- New cards are positioned to avoid overlapping existing ones

### Re-extraction

If you extract on a project that already has cards, you'll be asked whether to:
- **Clear All & Re-extract** - Remove existing cards and start fresh
- **Add to Existing** - Keep existing cards and add newly extracted ones

### Setting Up Your API Key

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Sign in with your Google account
3. Click **"Create API key"**
4. Choose a project (or create one) and click **"Create"**
5. Copy the key and paste it into Bookboard's Settings

Your key is stored only in your browser's localStorage and is sent directly to Google's API—it never touches any other server.

The free tier includes 15 requests/minute. Gemini Pro subscribers get higher limits.

## Debug Mode

If extraction isn't working as expected:

1. Open **Settings** from the library view
2. Enable **Debug Mode**
3. Run an extraction
4. Click **Download Debug Log** to get a detailed log file

The log includes timestamps, API request/response details, and any errors encountered.

## Local Development

No build step required. Just open `index.html` in a browser.

For live reload during development:

```bash
# Using Python
python -m http.server 8000

# Using Node
npx serve .
```

## Browser Support

Modern browsers only (Chrome, Firefox, Safari, Edge). Uses ES6+ features and CSS Grid.

## Data Storage

All data is stored in your browser's localStorage:

- `bookboard-index` - List of all projects
- `bookboard-project-{id}` - Individual project data
- `bookboard-gemini-key` - Your API key
- `bookboard-debug-mode` - Debug setting

If you clear your browser data, your projects will be lost—export regularly!

## Keyboard Shortcuts

- **←** (back button) - Return to corkboard from chapter editor, or to library from editor

## License

MIT
