const { useState, useEffect, useRef, useCallback } = React;

// Utility: Generate unique IDs
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Storage keys
const STORAGE_KEYS = {
  projectIndex: 'bookboard-index',
  projectPrefix: 'bookboard-project-',
  geminiKey: 'bookboard-gemini-key',
  lastOpenedProject: 'bookboard-last-opened'
};

// Default empty project
const createEmptyProject = () => ({
  id: generateId('proj'),
  title: "Untitled Novel",
  chapters: [],
  entities: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});

// Load project index from localStorage
const loadProjectIndex = () => {
  const stored = localStorage.getItem(STORAGE_KEYS.projectIndex);
  return stored ? JSON.parse(stored) : [];
};

// Save project index to localStorage
const saveProjectIndex = (index) => {
  localStorage.setItem(STORAGE_KEYS.projectIndex, JSON.stringify(index));
};

// Load a specific project
const loadProject = (projectId) => {
  const stored = localStorage.getItem(STORAGE_KEYS.projectPrefix + projectId);
  return stored ? JSON.parse(stored) : null;
};

// Save a specific project
const saveProject = (project) => {
  const updated = { ...project, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEYS.projectPrefix + project.id, JSON.stringify(updated));
  
  // Update index
  const index = loadProjectIndex();
  const existingIdx = index.findIndex(p => p.id === project.id);
  const indexEntry = {
    id: project.id,
    title: project.title,
    updatedAt: updated.updatedAt,
    chapterCount: project.chapters.length,
    entityCount: project.entities.length
  };
  
  if (existingIdx >= 0) {
    index[existingIdx] = indexEntry;
  } else {
    index.push(indexEntry);
  }
  saveProjectIndex(index);
  
  return updated;
};

// Delete a project
const deleteProjectFromStorage = (projectId) => {
  localStorage.removeItem(STORAGE_KEYS.projectPrefix + projectId);
  const index = loadProjectIndex().filter(p => p.id !== projectId);
  saveProjectIndex(index);
};

// Main App Component
function App() {
  const [view, setView] = useState('library'); // 'library' or 'editor'
  const [projectIndex, setProjectIndex] = useState(loadProjectIndex);
  const [currentProject, setCurrentProject] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [showExtractModal, setShowExtractModal] = useState(false);
  const [showImportConflictModal, setShowImportConflictModal] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [editingEntity, setEditingEntity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.geminiKey) || '');

  // Save Gemini key when it changes
  useEffect(() => {
    if (geminiKey) {
      localStorage.setItem(STORAGE_KEYS.geminiKey, geminiKey);
    }
  }, [geminiKey]);

  // Auto-save current project when it changes
  useEffect(() => {
    if (currentProject) {
      const saved = saveProject(currentProject);
      setProjectIndex(loadProjectIndex());
    }
  }, [currentProject]);

  // Open a project
  const openProject = (projectId) => {
    const project = loadProject(projectId);
    if (project) {
      setCurrentProject(project);
      setView('editor');
      localStorage.setItem(STORAGE_KEYS.lastOpenedProject, projectId);
    }
  };

  // Create new project
  const createNewProject = () => {
    const project = createEmptyProject();
    setCurrentProject(project);
    setView('editor');
  };

  // Go back to library
  const goToLibrary = () => {
    setCurrentProject(null);
    setView('library');
  };

  // Delete a project with confirmation
  const handleDeleteProject = (projectId, projectTitle) => {
    if (confirm(`Delete "${projectTitle}"? This cannot be undone.`)) {
      deleteProjectFromStorage(projectId);
      setProjectIndex(loadProjectIndex());
      if (currentProject?.id === projectId) {
        setCurrentProject(null);
        setView('library');
      }
    }
  };

  // Update project title
  const updateTitle = (title) => {
    setCurrentProject(prev => ({ ...prev, title }));
  };

  // Update entity position
  const updateEntityPosition = (id, x, y) => {
    setCurrentProject(prev => ({
      ...prev,
      entities: prev.entities.map(e => 
        e.id === id ? { ...e, position: { x, y } } : e
      )
    }));
  };

  // Delete entity
  const deleteEntity = (id) => {
    setCurrentProject(prev => ({
      ...prev,
      entities: prev.entities.filter(e => e.id !== id)
    }));
  };

  // Save entity (add or update)
  const saveEntity = (entity) => {
    setCurrentProject(prev => {
      const exists = prev.entities.find(e => e.id === entity.id);
      if (exists) {
        return {
          ...prev,
          entities: prev.entities.map(e => e.id === entity.id ? entity : e)
        };
      } else {
        return {
          ...prev,
          entities: [...prev.entities, { 
            ...entity, 
            id: generateId('ent'),
            position: entity.position || { x: 100 + Math.random() * 400, y: 100 + Math.random() * 300 }
          }]
        };
      }
    });
    setShowEntityModal(false);
    setEditingEntity(null);
  };

  // Reorder chapters
  const reorderChapters = (fromIndex, toIndex) => {
    setCurrentProject(prev => {
      const newChapters = [...prev.chapters];
      const [moved] = newChapters.splice(fromIndex, 1);
      newChapters.splice(toIndex, 0, moved);
      return {
        ...prev,
        chapters: newChapters.map((ch, i) => ({ ...ch, order: i + 1 }))
      };
    });
  };

  // Parse markdown to internal format
  const parseMarkdown = (markdown) => {
    const lines = markdown.split('\n');
    const chapters = [];
    let bookTitle = null;
    let currentChapter = null;
    let contentBuffer = [];

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      const h2Match = line.match(/^##\s+(.+)$/);
      
      if (h1Match && bookTitle === null) {
        bookTitle = h1Match[1];
        continue;
      }
      
      if (h2Match) {
        if (currentChapter) {
          currentChapter.content = contentBuffer.join('\n').trim();
          chapters.push(currentChapter);
        }
        currentChapter = {
          id: generateId('ch'),
          title: h2Match[1],
          content: '',
          order: chapters.length + 1
        };
        contentBuffer = [];
      } else if (currentChapter) {
        contentBuffer.push(line);
      }
    }

    if (currentChapter) {
      currentChapter.content = contentBuffer.join('\n').trim();
      chapters.push(currentChapter);
    }

    if (chapters.length === 0) {
      return parseMarkdownFallback(markdown);
    }

    return { bookTitle, chapters };
  };

  const parseMarkdownFallback = (markdown) => {
    const lines = markdown.split('\n');
    const chapters = [];
    let currentChapter = null;
    let contentBuffer = [];

    for (const line of lines) {
      const headerMatch = line.match(/^#{1,2}\s+(.+)$/);
      
      if (headerMatch) {
        if (currentChapter) {
          currentChapter.content = contentBuffer.join('\n').trim();
          chapters.push(currentChapter);
        }
        currentChapter = {
          id: generateId('ch'),
          title: headerMatch[1],
          content: '',
          order: chapters.length + 1
        };
        contentBuffer = [];
      } else if (currentChapter) {
        contentBuffer.push(line);
      }
    }

    if (currentChapter) {
      currentChapter.content = contentBuffer.join('\n').trim();
      chapters.push(currentChapter);
    }

    return { bookTitle: null, chapters };
  };

  // Check for title conflict and handle import
  const handleImport = (content, isJson) => {
    try {
      let importedTitle;
      let importedData;

      if (isJson) {
        const data = JSON.parse(content);
        if (!data.chapters) data.chapters = [];
        if (!data.entities) data.entities = [];
        importedTitle = data.title || 'Untitled Novel';
        importedData = { type: 'json', data };
      } else {
        const { bookTitle, chapters } = parseMarkdown(content);
        importedTitle = bookTitle || 'Untitled Novel';
        importedData = { type: 'markdown', bookTitle, chapters };
      }

      // Check for title conflict
      const existingProject = projectIndex.find(p => p.title.toLowerCase() === importedTitle.toLowerCase());
      
      if (existingProject) {
        setPendingImport({ ...importedData, title: importedTitle, existingProject });
        setShowImportModal(false);
        setShowImportConflictModal(true);
      } else {
        completeImport(importedData, importedTitle);
      }
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
  };

  // Complete the import (after conflict resolution if needed)
  const completeImport = (importedData, title, overwriteId = null) => {
    let project;

    if (overwriteId) {
      project = loadProject(overwriteId);
      if (importedData.type === 'json') {
        project = {
          ...importedData.data,
          id: overwriteId,
          title: title,
          createdAt: project.createdAt,
          chapters: importedData.data.chapters.map((ch, i) => ({
            ...ch,
            id: ch.id || generateId('ch'),
            order: ch.order || i + 1
          })),
          entities: importedData.data.entities.map((ent, i) => ({
            ...ent,
            id: ent.id || generateId('ent'),
            position: ent.position || { x: 100 + (i % 4) * 240, y: 80 + Math.floor(i / 4) * 200 }
          }))
        };
      } else {
        project = {
          ...project,
          title: title,
          chapters: importedData.chapters,
          entities: []
        };
      }
    } else {
      project = createEmptyProject();
      project.title = title;

      if (importedData.type === 'json') {
        project.chapters = importedData.data.chapters.map((ch, i) => ({
          ...ch,
          id: ch.id || generateId('ch'),
          order: ch.order || i + 1
        }));
        project.entities = importedData.data.entities.map((ent, i) => ({
          ...ent,
          id: ent.id || generateId('ent'),
          position: ent.position || { x: 100 + (i % 4) * 240, y: 80 + Math.floor(i / 4) * 200 }
        }));
      } else {
        project.chapters = importedData.chapters;
        project.entities = [];
      }
    }

    setCurrentProject(project);
    setView('editor');
    setShowImportModal(false);
    setShowImportConflictModal(false);
    setPendingImport(null);
  };

  // Handle conflict resolution
  const handleConflictResolution = (action) => {
    if (!pendingImport) return;

    if (action === 'overwrite') {
      completeImport(pendingImport, pendingImport.title, pendingImport.existingProject.id);
    } else if (action === 'new') {
      const baseTitle = pendingImport.title;
      let version = 2;
      while (projectIndex.find(p => p.title.toLowerCase() === `${baseTitle} v${version}`.toLowerCase())) {
        version++;
      }
      completeImport(pendingImport, `${baseTitle} v${version}`);
    } else {
      setShowImportConflictModal(false);
      setPendingImport(null);
    }
  };

  // Export as JSON
  const exportAsJson = () => {
    const blob = new Blob([JSON.stringify(currentProject, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.title.toLowerCase().replace(/\s+/g, '-')}-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export manuscript as Markdown
  const exportManuscript = () => {
    let md = `# ${currentProject.title}\n\n`;
    
    currentProject.chapters.forEach((ch) => {
      md += `## ${ch.title}\n\n`;
      md += `${ch.content}\n\n`;
    });

    const blob = new Blob([md.trim()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.title.toLowerCase().replace(/\s+/g, '-')}-manuscript.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export bible as Markdown
  const exportBible = () => {
    let md = `# ${currentProject.title} — Story Bible\n\n`;
    
    if (currentProject.chapters.length > 0) {
      md += `## Chapter Outline\n\n`;
      currentProject.chapters.forEach((ch, i) => {
        md += `${i + 1}. ${ch.title}\n`;
      });
      md += `\n`;
    }

    const entityTypes = ['character', 'theme', 'location', 'scene', 'idea'];
    const typeLabels = {
      character: 'Characters',
      theme: 'Themes',
      location: 'Locations',
      scene: 'Key Scenes',
      idea: 'Ideas & Notes'
    };

    entityTypes.forEach(type => {
      const entities = currentProject.entities.filter(e => e.type === type);
      if (entities.length > 0) {
        md += `## ${typeLabels[type]}\n\n`;
        entities.forEach(entity => {
          md += `### ${entity.name}\n\n`;
          if (entity.description) {
            md += `${entity.description}\n\n`;
          }
          if (entity.chapterRefs?.length > 0) {
            const chapterNames = entity.chapterRefs
              .map(id => {
                const ch = currentProject.chapters.find(c => c.id === id);
                return ch ? ch.title : null;
              })
              .filter(Boolean);
            if (chapterNames.length > 0) {
              md += `*Appears in: ${chapterNames.join(', ')}*\n\n`;
            }
          }
        });
      }
    });

    const blob = new Blob([md.trim()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject.title.toLowerCase().replace(/\s+/g, '-')}-bible.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Extract entities using Gemini API
  const extractEntities = async () => {
    if (!geminiKey) {
      alert('Please enter your Gemini API key');
      return;
    }

    if (currentProject.chapters.length === 0) {
      alert('Import a manuscript first');
      return;
    }

    setLoading(true);
    setLoadingMessage('Analysing manuscript...');
    setShowExtractModal(false);

    const fullText = currentProject.chapters.map((ch, i) => `## Chapter ${i + 1}: ${ch.title}\n${ch.content}`).join('\n\n');
    const truncatedText = fullText.substring(0, 50000);

    const prompt = `Analyse this novel excerpt and extract the following entities. For each entity, provide a JSON object.

TEXT:
${truncatedText}

Extract:
1. CHARACTERS: People mentioned by name. Include their role/description and which chapter numbers they appear in (1-indexed).
2. THEMES: Major themes or motifs you identify.
3. LOCATIONS: Named places or settings.
4. KEY SCENES: Important dramatic moments or turning points.

Respond ONLY with valid JSON in this exact format (no markdown code fences, no explanation, just the JSON):
{
  "entities": [
    {"type": "character", "name": "Name", "description": "Brief description", "chapterNums": [1, 2]},
    {"type": "theme", "name": "Theme Name", "description": "How it manifests", "chapterNums": []},
    {"type": "location", "name": "Place", "description": "Description", "chapterNums": [1]},
    {"type": "scene", "name": "Scene Title", "description": "What happens", "chapterNums": [3]}
  ]
}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
          }
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'API request failed');
      }

      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!content) {
        throw new Error('No response from Gemini');
      }

      const cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(cleanedContent);
      
      const newEntities = parsed.entities.map((entity, index) => ({
        ...entity,
        id: generateId('ent'),
        chapterRefs: (entity.chapterNums || [])
          .map(num => currentProject.chapters[num - 1]?.id)
          .filter(Boolean),
        position: {
          x: 80 + (index % 4) * 240,
          y: 60 + Math.floor(index / 4) * 200
        }
      }));

      newEntities.forEach(e => delete e.chapterNums);

      setCurrentProject(prev => ({
        ...prev,
        entities: [...prev.entities, ...newEntities]
      }));

      setLoading(false);
    } catch (error) {
      console.error('Entity extraction failed:', error);
      alert(`Extraction failed: ${error.message}`);
      setLoading(false);
    }
  };

  // Render library or editor view
  if (view === 'library') {
    return (
      <div className="app-container">
        <div className="library-header">
          <h1>Bookboard</h1>
          <div className="library-actions">
            <button className="btn" onClick={() => setShowImportModal(true)}>Import</button>
            <button className="btn btn-primary" onClick={createNewProject}>New Project</button>
          </div>
        </div>
        
        <div className="library-content">
          {projectIndex.length === 0 ? (
            <div className="empty-state">
              <h2>No projects yet</h2>
              <p>Import a manuscript or create a new project to get started.</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
                <button className="btn" onClick={() => setShowImportModal(true)}>Import</button>
                <button className="btn btn-primary" onClick={createNewProject}>New Project</button>
              </div>
            </div>
          ) : (
            <div className="project-grid">
              {projectIndex
                .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
                .map(project => (
                  <div key={project.id} className="project-card" onClick={() => openProject(project.id)}>
                    <button 
                      className="project-delete" 
                      onClick={(e) => { e.stopPropagation(); handleDeleteProject(project.id, project.title); }}
                      title="Delete project"
                    >
                      ×
                    </button>
                    <h3>{project.title}</h3>
                    <div className="project-meta">
                      <span>{project.chapterCount || 0} chapters</span>
                      <span>{project.entityCount || 0} cards</span>
                    </div>
                    <div className="project-date">
                      Last edited: {new Date(project.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        {showImportModal && (
          <ImportModal
            onImport={handleImport}
            onClose={() => setShowImportModal(false)}
          />
        )}

        {showImportConflictModal && pendingImport && (
          <ImportConflictModal
            existingTitle={pendingImport.existingProject.title}
            onOverwrite={() => handleConflictResolution('overwrite')}
            onCreateNew={() => handleConflictResolution('new')}
            onCancel={() => handleConflictResolution('cancel')}
          />
        )}
      </div>
    );
  }

  // Editor view
  return (
    <div className="app-container">
      <TopBar 
        title={currentProject.title}
        onTitleChange={updateTitle}
        onLibrary={goToLibrary}
        onImport={() => setShowImportModal(true)}
        onExport={() => setShowExportModal(true)}
        onExtract={() => setShowExtractModal(true)}
        hasChapters={currentProject.chapters.length > 0}
      />
      
      <div className="main-layout">
        <TimelinePanel 
          chapters={currentProject.chapters} 
          onReorder={reorderChapters}
        />
        <Corkboard 
          entities={currentProject.entities}
          chapters={currentProject.chapters}
          onUpdatePosition={updateEntityPosition}
          onEditEntity={(entity) => { setEditingEntity(entity); setShowEntityModal(true); }}
          onDeleteEntity={deleteEntity}
          isEmpty={currentProject.chapters.length === 0 && currentProject.entities.length === 0}
          onImport={() => setShowImportModal(true)}
        />
      </div>

      <button 
        className="add-entity-btn" 
        onClick={() => { setEditingEntity(null); setShowEntityModal(true); }}
        title="Add new card"
      >
        +
      </button>

      {showImportModal && (
        <ImportModal
          onImport={handleImport}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {showImportConflictModal && pendingImport && (
        <ImportConflictModal
          existingTitle={pendingImport.existingProject.title}
          onOverwrite={() => handleConflictResolution('overwrite')}
          onCreateNew={() => handleConflictResolution('new')}
          onCancel={() => handleConflictResolution('cancel')}
        />
      )}

      {showExportModal && (
        <ExportModal
          onExportJson={exportAsJson}
          onExportManuscript={exportManuscript}
          onExportBible={exportBible}
          hasChapters={currentProject.chapters.length > 0}
          hasEntities={currentProject.entities.length > 0}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showExtractModal && (
        <ExtractModal
          geminiKey={geminiKey}
          onGeminiKeyChange={setGeminiKey}
          onExtract={extractEntities}
          onClose={() => setShowExtractModal(false)}
        />
      )}

      {showEntityModal && (
        <EntityModal
          entity={editingEntity}
          chapters={currentProject.chapters}
          onSave={saveEntity}
          onClose={() => { setShowEntityModal(false); setEditingEntity(null); }}
        />
      )}

      {loading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <p>{loadingMessage}</p>
        </div>
      )}
    </div>
  );
}

// Top Bar Component (Editor view)
function TopBar({ title, onTitleChange, onLibrary, onImport, onExport, onExtract, hasChapters }) {
  return (
    <div className="top-bar">
      <button className="btn btn-back" onClick={onLibrary} title="Back to library">←</button>
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Novel Title"
      />
      <div className="top-bar-spacer"></div>
      <button className="btn" onClick={onImport}>Import</button>
      {hasChapters && (
        <button className="btn btn-secondary" onClick={onExtract}>Extract</button>
      )}
      <button className="btn btn-primary" onClick={onExport}>Export</button>
    </div>
  );
}

// Timeline Panel Component
function TimelinePanel({ chapters, onReorder }) {
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      onReorder(dragIndex, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="timeline-panel">
      <div className="timeline-header">Chapter Timeline</div>
      {chapters.length === 0 ? (
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', fontStyle: 'italic' }}>
          Import a manuscript to see chapters here
        </p>
      ) : (
        chapters.map((chapter, index) => (
          <div 
            key={chapter.id} 
            className={`chapter-card ${dragIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          >
            <div className="chapter-number">Chapter {index + 1}</div>
            <div className="chapter-title">{chapter.title}</div>
            {chapter.content && (
              <div className="chapter-preview">{chapter.content.substring(0, 120)}...</div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Corkboard Component
function Corkboard({ entities, chapters, onUpdatePosition, onEditEntity, onDeleteEntity, isEmpty, onImport }) {
  return (
    <div className="corkboard">
      {isEmpty ? (
        <div className="empty-state">
          <h2>Your corkboard is empty</h2>
          <p>
            Import a manuscript (Markdown) or a project file (JSON) to get started.
            You can also manually add cards using the + button.
          </p>
          <button className="btn btn-primary" onClick={onImport}>Import</button>
        </div>
      ) : (
        <div className="corkboard-inner">
          {entities.map(entity => (
            <EntityCard
              key={entity.id}
              entity={entity}
              chapters={chapters}
              onUpdatePosition={onUpdatePosition}
              onEdit={() => onEditEntity(entity)}
              onDelete={() => onDeleteEntity(entity.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Entity Card Component (Draggable)
function EntityCard({ entity, chapters, onUpdatePosition, onEdit, onDelete }) {
  const cardRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.classList.contains('entity-delete')) return;
    setIsDragging(true);
    const rect = cardRef.current.getBoundingClientRect();
    setOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const parent = cardRef.current.closest('.corkboard-inner');
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const scrollLeft = cardRef.current.closest('.corkboard').scrollLeft;
    const scrollTop = cardRef.current.closest('.corkboard').scrollTop;
    const x = e.clientX - parentRect.left + scrollLeft - offset.x;
    const y = e.clientY - parentRect.top + scrollTop - offset.y;
    onUpdatePosition(entity.id, Math.max(0, x), Math.max(0, y));
  }, [isDragging, offset, entity.id, onUpdatePosition]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const chapterNames = (entity.chapterRefs || [])
    .map(id => {
      const ch = chapters.find(c => c.id === id);
      return ch ? chapters.indexOf(ch) + 1 : null;
    })
    .filter(Boolean);

  return (
    <div
      ref={cardRef}
      className={`entity-card ${entity.type}`}
      style={{
        left: entity.position?.x || 0,
        top: entity.position?.y || 0,
        transform: `rotate(${(entity.id.charCodeAt(4) % 5) - 2}deg)`
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onEdit}
    >
      <button className="entity-delete" onClick={onDelete} title="Delete card">×</button>
      <div className="entity-type">{entity.type}</div>
      <div className="entity-name">{entity.name}</div>
      {entity.description && (
        <div className="entity-description">{entity.description}</div>
      )}
      {chapterNames.length > 0 && (
        <div className="entity-chapters">
          Ch. {chapterNames.join(', ')}
        </div>
      )}
    </div>
  );
}

// Import Modal Component
function ImportModal({ onImport, onClose }) {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const isJson = file.name.endsWith('.json');
      onImport(content, isJson);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Import</h2>
        
        <div
          className={`import-area ${dragOver ? 'dragover' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <p><strong>Drop a file here</strong> or click to browse</p>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-light)', marginTop: '12px' }}>
            Supports <strong>.md</strong> (Markdown) or <strong>.json</strong> (Project file)
          </p>
        </div>

        <p className="help-text">
          <strong>Markdown:</strong> # is book title, ## headers become chapters.
        </p>
        <p className="help-text">
          <strong>JSON:</strong> Full project format with chapters and entities.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.json,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Import Conflict Modal
function ImportConflictModal({ existingTitle, onOverwrite, onCreateNew, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Project Already Exists</h2>
        <p style={{ marginBottom: '24px' }}>
          A project called "<strong>{existingTitle}</strong>" already exists. What would you like to do?
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="btn btn-primary" onClick={onOverwrite}>
            Overwrite Existing
          </button>
          <button className="btn btn-secondary" onClick={onCreateNew}>
            Create as New Version
          </button>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Export Modal Component
function ExportModal({ onExportJson, onExportManuscript, onExportBible, hasChapters, hasEntities, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Export</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {hasChapters && (
            <div>
              <button 
                className="btn btn-primary" 
                style={{ width: '100%' }} 
                onClick={() => { onExportManuscript(); onClose(); }}
              >
                Export Manuscript
              </button>
              <p className="help-text" style={{ marginTop: '8px' }}>
                Full novel text in chapter order. Ready to paste back into your editor.
              </p>
            </div>
          )}

          {hasEntities && (
            <div>
              <button 
                className="btn btn-secondary" 
                style={{ width: '100%' }} 
                onClick={() => { onExportBible(); onClose(); }}
              >
                Export Bible
              </button>
              <p className="help-text" style={{ marginTop: '8px' }}>
                Characters, themes, locations, scenes. Reference document for your story.
              </p>
            </div>
          )}

          <div>
            <button 
              className="btn" 
              style={{ width: '100%' }} 
              onClick={() => { onExportJson(); onClose(); }}
            >
              Export Project (JSON)
            </button>
            <p className="help-text" style={{ marginTop: '8px' }}>
              Complete project data. Use for backup or sharing.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// Extract Modal Component (Gemini API)
function ExtractModal({ geminiKey, onGeminiKeyChange, onExtract, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Extract Entities</h2>
        <p style={{ marginBottom: '20px', color: 'var(--ink-light)' }}>
          Use Gemini AI to automatically extract characters, themes, locations, and key scenes from your manuscript.
        </p>
        
        <div className="api-key-section">
          <label>Gemini API Key</label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => onGeminiKeyChange(e.target.value)}
            placeholder="AIza..."
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          />
          <p className="help-text" style={{ marginTop: '8px' }}>
            Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-pin)' }}>aistudio.google.com/apikey</a>
          </p>
          <p className="help-text">
            Your key is stored only in your browser's localStorage.
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button 
            className="btn btn-primary" 
            onClick={onExtract}
            disabled={!geminiKey}
          >
            Extract
          </button>
        </div>
      </div>
    </div>
  );
}

// Entity Edit Modal Component
function EntityModal({ entity, chapters, onSave, onClose }) {
  const [form, setForm] = useState(entity || {
    type: 'character',
    name: '',
    description: '',
    chapterRefs: []
  });

  const handleChapterToggle = (chapterId) => {
    setForm(prev => {
      const refs = prev.chapterRefs || [];
      if (refs.includes(chapterId)) {
        return { ...prev, chapterRefs: refs.filter(id => id !== chapterId) };
      } else {
        return { ...prev, chapterRefs: [...refs, chapterId] };
      }
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      alert('Please enter a name');
      return;
    }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{entity ? 'Edit Card' : 'Add Card'}</h2>
        
        <form onSubmit={handleSubmit}>
          <label>Type</label>
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="character">Character</option>
            <option value="theme">Theme</option>
            <option value="location">Location</option>
            <option value="scene">Scene</option>
            <option value="idea">Idea / Note</option>
          </select>

          <label>Name</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Enter name..."
            autoFocus
          />

          <label>Description</label>
          <textarea
            value={form.description || ''}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Notes, details, observations..."
          />

          {chapters.length > 0 && (
            <>
              <label>Appears in Chapters</label>
              <div className="chapter-checkboxes">
                {chapters.map((ch, i) => (
                  <label key={ch.id} className="chapter-checkbox">
                    <input
                      type="checkbox"
                      checked={(form.chapterRefs || []).includes(ch.id)}
                      onChange={() => handleChapterToggle(ch.id)}
                    />
                    {i + 1}. {ch.title.substring(0, 20)}{ch.title.length > 20 ? '...' : ''}
                  </label>
                ))}
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Render the app
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
