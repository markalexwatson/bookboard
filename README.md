# Bookboard

A visual planning tool for novelists. Pin your characters, themes, locations, and scenes to a digital corkboard. Drag cards around, organise your thoughts, export a "bible" document.

## Features

- **Chapter Timeline**: Import your manuscript and see chapters in order. Drag to reorder.
- **Free-form Corkboard**: Pin cards for characters, themes, locations, scenes, and ideas. Drag them anywhere.
- **Import/Export**: Round-trip your data as JSON, or export a readable Markdown bible.
- **Auto-save**: Everything saves to your browser's localStorage automatically.
- **No backend**: Pure client-side. Your data never leaves your browser.

## Usage

### Quick Start

1. Open `index.html` in your browser (or visit the GitHub Pages URL)
2. Click **Import** and drop in a Markdown file (your manuscript) or a JSON file (a previous export)
3. Add cards using the **+** button
4. Drag cards around the corkboard to organise
5. Click **Export Bible** when you're ready to save

### Hosting on GitHub Pages

1. Fork or clone this repository
2. Enable GitHub Pages in your repo settings (Settings → Pages → Source: main branch)
3. Access at `https://yourusername.github.io/bookboard/`

### Markdown Import Format

The importer treats `#` and `##` headers as chapter titles. Everything between headers becomes chapter content.

```markdown
# Chapter One: The Beginning

It was a dark and stormy night. The detective paced his office,
chain-smoking and muttering about the case.

# Chapter Two: The Discovery

The body was found at dawn...
```

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

#### Generating Entities with Claude

If you want to auto-extract entities from your manuscript, you can use Claude (or any LLM) separately. Here's a prompt that works well:

```
Analyze this novel excerpt and extract entities. For each, provide:
- type: character|theme|location|scene
- name: short identifier
- description: 1-2 sentences
- chapterRefs: array of chapter numbers where it appears

Respond with valid JSON matching this schema:
{
  "entities": [
    {"type": "character", "name": "...", "description": "...", "chapterRefs": [1, 2]}
  ]
}

[Paste your manuscript here]
```

Then merge the extracted entities into your bible JSON before importing.

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
