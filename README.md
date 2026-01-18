# Bookboard

A visual planning tool for novelists. Pin your characters, themes, locations, and scenes to a digital corkboard. Drag cards around, organise your thoughts, export a "bible" document.

## Features

- **Chapter Timeline**: Import your manuscript and see chapters in order. Drag to reorder.
- **Free-form Corkboard**: Pin cards for characters, themes, locations, scenes, and ideas. Drag them anywhere.
- **AI Extraction**: Use Gemini to automatically extract characters, themes, locations, and key scenes from your manuscript.
- **Import/Export**: 
  - Import Markdown manuscripts or JSON project files
  - Export your manuscript (full text in chapter order)
  - Export your bible (characters, themes, etc.)
  - Export JSON for backup/restore
- **Auto-save**: Everything saves to your browser's localStorage automatically.
- **No backend**: Pure client-side. Your data never leaves your browser (API calls go direct to Gemini).

## Usage

### Quick Start

1. Open `index.html` in your browser (or visit the GitHub Pages URL)
2. Click **Import** and drop in a Markdown file (your manuscript) or a JSON file (a previous export)
3. Click **Extract** to use Gemini AI to identify characters, themes, locations, and scenes (requires API key)
4. Add or edit cards using the **+** button or by double-clicking existing cards
5. Drag cards around the corkboard to organise
6. Click **Export** to save your manuscript, bible, or project backup

### Hosting on GitHub Pages

1. Fork or clone this repository
2. Enable GitHub Pages in your repo settings (Settings → Pages → Source: main branch)
3. Access at `https://yourusername.github.io/bookboard/`

### Markdown Import Format

The importer treats `#` as the book title and `##` as chapter headers. Everything between chapter headers becomes chapter content.

```markdown
# My Novel Title

## Chapter One: The Beginning

It was a dark and stormy night. The detective paced his office,
chain-smoking and muttering about the case.

## Chapter Two: The Discovery

The body was found at dawn...
```

If your document only uses `#` headers (no `##`), they'll be treated as chapters instead.

### JSON Format (Bible Schema)

For full round-trip fidelity, use JSON. This is also the format to use if you pre-process your manuscript with Claude or another LLM to extract entities.

```json
{
  "title": "My Novel",
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

#### Entity Types

- `character` - People in your story
- `theme` - Recurring ideas or motifs
- `location` - Places and settings  
- `scene` - Key dramatic moments
- `idea` - Freeform notes

### Using AI Extraction

Click the **Extract** button in the toolbar to use Gemini AI to automatically identify:
- Characters (people mentioned by name)
- Themes (recurring ideas or motifs)
- Locations (places and settings)
- Key scenes (important dramatic moments)

You'll need a Gemini API key, which you can get free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Your key is stored only in your browser's localStorage and is sent directly to Google's API—it never touches any other server.

Extracted entities are added to your corkboard. You can then edit, rearrange, or delete them as needed.

## Local Development

No build step required. Just open `index.html` in a browser.

If you want live reload during development:

```bash
# Using Python
python -m http.server 8000

# Using Node
npx serve .
```

## Browser Support

Modern browsers only (Chrome, Firefox, Safari, Edge). Uses ES6+ features and CSS Grid.

## Data Privacy

All data is stored in your browser's localStorage. Nothing is sent to any server. If you clear your browser data, your project will be lost—export regularly!

## License

MIT
