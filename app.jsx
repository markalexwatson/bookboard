const { useState, useEffect, useRef, useCallback } = React;

// Utility: Generate unique IDs
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Default empty project
const emptyProject = {
  title: "Untitled Novel",
  chapters: [],
  entities: []
};

// Main App Component
function App() {
  const [project, setProject] = useState(() => {
    const saved = localStorage.getItem('bookboard-project');
    return saved ? JSON.parse(saved) : emptyProject;
  });
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [editingEntity, setEditingEntity] = useState(null);

  // Auto-save to localStorage
  useEffect(() => {
    localStorage.setItem('bookboard-project', JSON.stringify(project));
  }, [project]);

  // Update project title
  const updateTitle = (title) => {
    setProject(prev => ({ ...prev, title }));
  };

  // Update entity position
  const updateEntityPosition = (id, x, y) => {
    setProject(prev => ({
      ...prev,
      entities: prev.entities.map(e => 
        e.id === id ? { ...e, position: { x, y } } : e
      )
    }));
  };

  // Delete entity
  const deleteEntity = (id) => {
    setProject(prev => ({
      ...prev,
      entities: prev.entities.filter(e => e.id !== id)
    }));
  };

  // Save entity (add or update)
  const saveEntity = (entity) => {
    setProject(prev => {
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
    setProject(prev => {
      const newChapters = [...prev.chapters];
      const [moved] = newChapters.splice(fromIndex, 1);
      newChapters.splice(toIndex, 0, moved);
      // Update order property
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
    let currentChapter = null;
    let contentBuffer = [];

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      const h2Match = line.match(/^##\s+(.+)$/);
      
      if (h1Match || h2Match) {
        if (currentChapter) {
          currentChapter.content = contentBuffer.join('\n').trim();
          chapters.push(currentChapter);
        }
        currentChapter = {
          id: generateId('ch'),
          title: (h1Match || h2Match)[1],
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

    return chapters;
  };

  // Import handler
  const handleImport = (content, isJson) => {
    try {
      if (isJson) {
        const data = JSON.parse(content);
        // Validate structure
        if (!data.chapters) data.chapters = [];
        if (!data.entities) data.entities = [];
        if (!data.title) data.title = 'Untitled Novel';
        
        // Ensure all chapters have IDs
        data.chapters = data.chapters.map((ch, i) => ({
          ...ch,
          id: ch.id || generateId('ch'),
          order: ch.order || i + 1
        }));
        
        // Ensure all entities have IDs and positions
        data.entities = data.entities.map((ent, i) => ({
          ...ent,
          id: ent.id || generateId('ent'),
          position: ent.position || { x: 100 + (i % 4) * 240, y: 80 + Math.floor(i / 4) * 200 }
        }));
        
        setProject(data);
      } else {
        const chapters = parseMarkdown(content);
        setProject(prev => ({
          ...prev,
          chapters,
          entities: []
        }));
      }
    } catch (error) {
      alert(`Import failed: ${error.message}`);
    }
    setShowImportModal(false);
  };

  // Export as JSON
  const exportAsJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/\s+/g, '-')}-bible.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export as Markdown
  const exportAsMarkdown = () => {
    let md = `# ${project.title}\n\n`;
    
    // Chapters
    if (project.chapters.length > 0) {
      md += `## Chapters\n\n`;
      project.chapters.forEach((ch, i) => {
        md += `### ${i + 1}. ${ch.title}\n\n`;
        if (ch.content) {
          const preview = ch.content.substring(0, 300);
          md += `${preview}${ch.content.length > 300 ? '...' : ''}\n\n`;
        }
      });
    }

    // Entities by type
    const entityTypes = ['character', 'theme', 'location', 'scene', 'idea'];
    const typeLabels = {
      character: 'Characters',
      theme: 'Themes',
      location: 'Locations',
      scene: 'Key Scenes',
      idea: 'Ideas & Notes'
    };

    entityTypes.forEach(type => {
      const entities = project.entities.filter(e => e.type === type);
      if (entities.length > 0) {
        md += `## ${typeLabels[type]}\n\n`;
        entities.forEach(entity => {
          md += `### ${entity.name}\n\n`;
          if (entity.description) {
            md += `${entity.description}\n\n`;
          }
          if (entity.chapterRefs?.length > 0) {
            const chapterNames = entity.chapterRefs
              .map(id => project.chapters.find(c => c.id === id)?.title)
              .filter(Boolean);
            if (chapterNames.length > 0) {
              md += `*Appears in: ${chapterNames.join(', ')}*\n\n`;
            }
          }
        });
      }
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.title.toLowerCase().replace(/\s+/g, '-')}-bible.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // New project
  const newProject = () => {
    if (confirm('Start a new project? Unsaved changes will be lost.')) {
      setProject(emptyProject);
    }
  };

  return (
    <div className="app-container">
      <TopBar 
        title={project.title}
        onTitleChange={updateTitle}
        onNew={newProject}
        onImport={() => setShowImportModal(true)}
        onExport={() => setShowExportModal(true)}
      />
      
      <div className="main-layout">
        <TimelinePanel 
          chapters={project.chapters} 
          onReorder={reorderChapters}
        />
        <Corkboard 
          entities={project.entities}
          chapters={project.chapters}
          onUpdatePosition={updateEntityPosition}
          onEditEntity={(entity) => { setEditingEntity(entity); setShowEntityModal(true); }}
          onDeleteEntity={deleteEntity}
          isEmpty={project.chapters.length === 0 && project.entities.length === 0}
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

      {showExportModal && (
        <ExportModal
          onExportJson={exportAsJson}
          onExportMarkdown={exportAsMarkdown}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showEntityModal && (
        <EntityModal
          entity={editingEntity}
          chapters={project.chapters}
          onSave={saveEntity}
          onClose={() => { setShowEntityModal(false); setEditingEntity(null); }}
        />
      )}
    </div>
  );
}

// Top Bar Component
function TopBar({ title, onTitleChange, onNew, onImport, onExport }) {
  return (
    <div className="top-bar">
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Novel Title"
      />
      <button className="btn" onClick={onNew}>New</button>
      <button className="btn" onClick={onImport}>Import</button>
      <button className="btn btn-primary" onClick={onExport}>Export Bible</button>
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
            Import a manuscript (Markdown) or a pre-processed bible (JSON) to get started.
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

  // Get chapter names for display
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
            Supports <strong>.md</strong> (Markdown) or <strong>.json</strong> (Bible format)
          </p>
        </div>

        <p className="help-text">
          <strong>Markdown:</strong> Chapters parsed from # or ## headers. Content between headers becomes chapter text.
        </p>
        <p className="help-text">
          <strong>JSON:</strong> Full bible format with chapters and entities. Use this to restore a previous export.
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

// Export Modal Component
function ExportModal({ onExportJson, onExportMarkdown, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Export Bible</h2>
        <p style={{ marginBottom: '24px', color: 'var(--ink-light)' }}>
          Choose your export format:
        </p>
        
        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onExportJson(); onClose(); }}>
            JSON
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { onExportMarkdown(); onClose(); }}>
            Markdown
          </button>
        </div>

        <p className="help-text">
          <strong>JSON:</strong> Complete data format. Best for backup and re-importing later.
        </p>
        <p className="help-text">
          <strong>Markdown:</strong> Human-readable document. Good for sharing or reference.
        </p>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
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
