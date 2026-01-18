# Bookboard

A visual planning tool for novelists. Organise your characters, themes, locations, and scenes into folders on a digital corkboard. Extract structure from your manuscript with AI, drag cards around, export a "bible" document.

## Features

- **Folder-Based Organisation**: Cards are organised into folders by type (Characters, Scenes, Locations, Themes, Ideas). Click a folder to view and arrange its cards.
- **Custom Folders**: Create your own folders (e.g., "Antagonists", "Act 1", "Red Herrings") to group cards across types.
- **Chapter Timeline**: Import your manuscript and see chapters in order. Drag to reorder. Click to edit.
- **AI Extraction**: Use Gemini to automatically extract characters, themes, locations, and key scenes from your manuscript.
- **Import/Export**: 
  - Import Markdown manuscripts or JSON project files
  - Export your manuscript (full text in chapter order)
  - Export your bible (characters, themes, custom folders, etc.)
  - Export JSON for backup/restore
- **Auto-save**: Everything saves to your browser's localStorage automatically.
- **No backend**: Pure client-side. Your data never leaves your browser (API calls go direct to Gemini).

## Usage

### Quick Start

1. Open `index.html` in your browser (or visit the GitHub Pages URL)
2. Click **Import** and drop in a Markdown file (your manuscript) or a JSON file (a previous export)
3. Click **Extract** to use Gemini AI to identify characters, themes, locations, and scenes (requires API key)
4. Click folders to view cards of each type; drag cards to arrange them
5. Use the **+** button to add new folders (at top level) or cards (inside a folder)
6. Press **ESC** to return from a folder to the top-level view
7. Click **Export** to save your manuscript, bible, or project backup

### Navigation

- **Top-level view**: Shows all folders (5 built-in types + any custom folders you've created)
- **Inside a folder**: Shows all cards of that type, freely draggable
- **+ button**: At top level, creates a custom folder. Inside a folder, adds a card of that type.
- **ESC key**: Returns to top-level folder view
- **Double-click a card**: Edit its details

### Custom Folders

Custom folders let you group cards across types. For example:

- "Antagonists" — group villains and morally ambiguous characters
- "Act 1" / "Act 2" / "Act 3" — organise by story structure
- "Red Herrings" — track misleading clues
- "Flashbacks" — group scenes that occur in the past

Cards can belong to both their type folder (e.g., Characters) AND a custom folder (e.g., Antagonists). They appear in both places but remain a single entity.

To assign a card to a custom folder, edit the card and select from the "Custom Folder" dropdown.

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

### JSON Format

For full round-trip fidelity, use JSON. This preserves card positions, custom folders, and all metadata.

```json
{
  "title": "My Novel",
  "customFolders": ["Antagonists", "Act 1"],
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
      "folder": "Antagonists",
      "position": { "x": 150, "y": 100 }
    },
    {
      "id": "ent-2",
      "type": "theme",
      "name": "Institutional Corruption",
      "description": "The rot runs deeper than any individual.",
      "chapterRefs": [],
      "folder": null,
      "position": { "x": 400, "y": 100 }
    }
  ]
}
```

#### Entity Types

- `character` — People in your story
- `theme` — Recurring ideas or motifs
- `location` — Places and settings  
- `scene` — Key dramatic moments
- `idea` — Freeform notes

#### Entity Fields

- `type` — One of the five types above (required)
- `name` — Display name (required)
- `description` — Notes, details, observations (optional)
- `chapterRefs` — Array of chapter IDs where this entity appears (optional)
- `folder` — Name of a custom folder, or null (optional)
- `position` — `{x, y}` coordinates on the corkboard (optional, auto-assigned if missing)

### Using AI Extraction

Click the **Extract** button in the toolbar to use Gemini AI to automatically identify:
- Characters (people mentioned by name)
- Themes (recurring ideas or motifs)
- Locations (places and settings)
- Key scenes (important dramatic moments)

You'll need a Gemini API key, which you can get free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Your key is stored only in your browser's localStorage and is sent directly to Google's API—it never touches any other server.

Extracted entities are added to your existing cards. You can then edit, rearrange, assign to custom folders, or delete them as needed.

#### Extraction Options

When you have existing cards, clicking Extract gives you two options:
- **Clear All & Re-extract**: Removes existing cards and starts fresh
- **Add to Existing**: Keeps your cards and adds newly extracted ones (duplicates are merged)

### Exports

- **Project (JSON)**: Complete backup including positions, custom folders, everything. Use for backup/restore.
- **Manuscript (Markdown)**: Just the chapter text in order. Use for editing in other tools.
- **Bible (Markdown)**: Structured document with chapter outline, all entities by type, and custom folder contents. Use as a reference while writing.

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

All data is stored in your browser's localStorage. Nothing is sent to any server except:
- Gemini API calls (your manuscript text is sent to Google for extraction, if you use that feature)

If you clear your browser data, your projects will be lost—export regularly!

## Version

Current version: 2.0

## License

MIT
