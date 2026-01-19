# Bookboard

A visual planning tool for novelists. Organise your characters, themes, locations, and scenes into folders on a digital corkboard. Extract structure from your manuscript with AI, drag cards around, sync across devices with Google Drive, export a "bible" document.

## Features

- **Google Drive Sync**: Sync projects across devices. API keys stay local and are never uploaded.
- **Folder-Based Organisation**: Cards are organised into folders by type (Characters, Scenes, Locations, Themes, Ideas). Click a folder to view and arrange its cards.
- **Custom Folders**: Create your own folders (e.g., "Antagonists", "Act 1", "Red Herrings") to group cards across types.
- **Novel & Collection Support**: Works with both novels (continuous story) and short story collections (independent stories).
- **Chapter Timeline**: Import your manuscript and see chapters in order. Drag to reorder. Click to edit.
- **Front Matter Preservation**: Epigraphs, dedications, and other content before the first chapter are captured and editable.
- **AI Extraction**: Use Gemini to automatically extract characters, themes, locations, and key scenes from your manuscript.
- **Merge Cards**: Combine duplicate or related cards with shift+click selection.
- **Import/Export**: 
  - Import Markdown manuscripts or JSON project files
  - Export your manuscript (full text in chapter order)
  - Export your bible (characters, themes, custom folders, etc.)
  - Export JSON for backup/restore
- **Auto-save**: Everything saves to your browser's localStorage automatically.
- **No backend**: Pure client-side. Your data stays on your device and your Google Drive.

## Quick Start

1. Open `index.html` in your browser (or serve locally with `python -m http.server 8000`)
2. Click **Import** and drop in a Markdown file (your manuscript) or a JSON file (a previous export)
3. Click **Extract** to use Gemini AI to identify characters, themes, locations, and scenes (requires API key)
4. Click folders to view cards of each type; drag cards to arrange them
5. Use the **+** button to add new folders (at top level) or cards (inside a folder)
6. Press **ESC** to return from a folder to the top-level view
7. Click **Export** to save your manuscript, bible, or project backup

## Google Drive Sync

Sync your projects across multiple devices using Google Drive. Your manuscripts are stored in a "Bookboard" folder on your Drive.

**Security model:**
- Project data syncs to Google Drive
- API keys (Gemini, Google Client ID) stay in local browser storage only — never uploaded
- The app can only access files it creates (uses `drive.file` scope)
- Even if someone accesses your Drive, they can't use your API keys

### Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create one)
3. Enable the **Google Drive API**:
   - Go to APIs & Services → Library
   - Search for "Google Drive API"
   - Click Enable
4. Create OAuth credentials:
   - Go to APIs & Services → Credentials
   - Click **Create Credentials** → **OAuth client ID**
   - Choose **Web application**
   - Add to **Authorized JavaScript origins**:
     - `http://localhost:8000` (for local development)
     - Your GitHub Pages URL (if hosted there)
   - Click Create and copy the **Client ID**
5. Set up OAuth consent screen:
   - Go to APIs & Services → OAuth consent screen
   - Choose External (or Internal if using Google Workspace)
   - Fill in required fields
   - For personal use, you can leave it in "Testing" mode and add your email as a test user
6. In Bookboard, go to **Settings** and paste your Client ID
7. Click **Sign in to Google**

### Usage

Once signed in:

- **Library view**:
  - **☁️ Drive** — View and load projects from Google Drive
  - **⬆️ Sync All** — Upload all local projects to Drive
  
- **Editor view**:
  - **☁️** button — Save current project to Drive

When loading a project that exists both locally and on Drive, you'll be asked which version to keep.

## Navigation

- **Top-level view**: Shows all folders (5 built-in types + any custom folders you've created)
- **Inside a folder**: Shows all cards of that type, freely draggable
- **+ button**: At top level, creates a custom folder. Inside a folder, adds a card of that type.
- **⊞ button**: Rearrange cards in current folder to a tidy grid
- **ESC key**: Returns to top-level folder view (or clears merge selection)
- **Double-click a card**: Edit its details
- **Shift+click cards**: Select cards for merging (same type only)

## Novel vs Short Story Collection

When extracting entities, you'll be asked whether your manuscript is:

- **Novel** (default): A single continuous story. Characters appearing in multiple chapters are merged into one card. Cards show chapter numbers (e.g., "Ch. 1, 3, 7").

- **Short Story Collection**: Independent stories. Characters with the same name in different stories remain separate (no deduplication). Cards show story titles instead of chapter numbers.

## Merging Cards

If you have duplicate cards or want to combine related entries:

1. Open any folder containing 2+ cards
2. **Shift+click** two cards of the same type to select them (blue highlight appears)
3. Click the **🔗 Merge** button in the header (turns blue when ready)
4. The merged card combines descriptions and chapter/story references
5. Press **ESC** to cancel and clear selection

## Custom Folders

Custom folders let you group cards across types. For example:

- "Antagonists" — group villains and morally ambiguous characters
- "Act 1" / "Act 2" / "Act 3" — organise by story structure
- "Red Herrings" — track misleading clues
- "Flashbacks" — group scenes that occur in the past

Cards can belong to both their type folder (e.g., Characters) AND a custom folder (e.g., Antagonists). They appear in both places but remain a single entity.

To assign a card to a custom folder, edit the card and select from the "Custom Folder" dropdown (directly below the Type selector).

## Markdown Import Format

The importer treats `#` as the book title and `##` as chapter headers. Everything between chapter headers becomes chapter content.

**Front matter** (epigraphs, dedications, etc.) appearing after the title but before the first chapter is preserved as a special "Front Matter" section.

```markdown
# My Novel Title

_For everyone who believed in me._

> "The only way out is through." — Robert Frost

## Chapter One: The Beginning

It was a dark and stormy night. The detective paced his office,
chain-smoking and muttering about the case.

## Chapter Two: The Discovery

The body was found at dawn...
```

If your document only uses `#` headers (no `##`), they'll be treated as chapters instead.

## JSON Format

For full round-trip fidelity, use JSON. This preserves card positions, custom folders, book type, and all metadata.

```json
{
  "title": "My Novel",
  "bookType": "novel",
  "customFolders": ["Antagonists", "Act 1"],
  "chapters": [
    {
      "id": "ch-0",
      "title": "Front Matter",
      "content": "For everyone who believed in me.",
      "order": 0,
      "isFrontMatter": true
    },
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
      "position": { "x": 40, "y": 40 }
    }
  ]
}
```

### Entity Types

- `character` — People in your story
- `theme` — Recurring ideas or motifs
- `location` — Places and settings  
- `scene` — Key dramatic moments
- `idea` — Freeform notes

### Entity Fields

- `type` — One of the five types above (required)
- `name` — Display name (required)
- `description` — Notes, details, observations (optional)
- `chapterRefs` — Array of chapter IDs where this entity appears (optional, for novels)
- `storyRefs` — Array of story titles where this entity appears (optional, for collections)
- `folder` — Name of a custom folder, or null (optional)
- `position` — `{x, y}` coordinates on the corkboard (optional, auto-assigned if missing)

## AI Extraction

Click the **Extract** button in the toolbar to use Gemini AI to automatically identify:
- Characters (people mentioned by name)
- Themes (recurring ideas or motifs)
- Locations (places and settings)
- Key scenes (important dramatic moments)

You'll need a Gemini API key, which you can get free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Your key is stored only in your browser's localStorage — it's never synced to Google Drive or sent anywhere except directly to Google's Gemini API.

### Extraction Options

When you have existing cards, clicking Extract gives you two options:
- **Clear All & Re-extract**: Removes existing cards and starts fresh
- **Add to Existing**: Keeps your cards and adds newly extracted ones

## Exports

- **Project (JSON)**: Complete backup including positions, custom folders, book type, everything. Use for backup/restore.
- **Manuscript (Markdown)**: Just the chapter text in order. Use for editing in other tools.
- **Bible (Markdown)**: Structured document with chapter outline, all entities by type, and custom folder contents. Use as a reference while writing.

## Hosting

### Local Development

No build step required. Just serve the directory:

```bash
# Using Python
python -m http.server 8000

# Using Node
npx serve .
```

Then open `http://localhost:8000` in your browser.

### GitHub Pages

1. Fork or clone this repository
2. Enable GitHub Pages in your repo settings (Settings → Pages → Source: main branch)
3. Add your GitHub Pages URL to your Google OAuth credentials (Authorized JavaScript origins)
4. Access at `https://yourusername.github.io/bookboard/`

## Browser Support

Modern browsers only (Chrome, Firefox, Safari, Edge). Uses ES6+ features and CSS Grid.

## Data Privacy

- **Local storage**: Working copies of projects, API keys, settings
- **Google Drive** (if enabled): Project data only (no API keys)
- **Gemini API** (if used): Your manuscript text is sent to Google for entity extraction

If you clear your browser data, your local projects and settings will be lost. Use Google Drive sync or manual JSON export for backup.

## Version

Current version: 2.2

## Changelog

### 2.2
- Google Drive sync (projects sync across devices, API keys stay local)
- Save to Drive button in editor toolbar
- Load from Drive modal in library
- Sync All button to upload all local projects
- Collapsible help sections in Settings

### 2.1
- Novel vs Collection mode for extraction (collections skip deduplication, show story titles)
- Front matter preservation (epigraphs, dedications before first chapter)
- Merge cards feature (shift+click to select, combine duplicates)
- Grid-based card positioning (no more off-screen scatter)
- Rearrange button to reset card layout
- Custom folder dropdown moved under Type for clarity

### 2.0
- Folder-based navigation (cards organised by type)
- Custom folders for cross-type grouping
- ESC key navigation

### 1.x
- Initial release with corkboard, AI extraction, import/export

## License

MIT
