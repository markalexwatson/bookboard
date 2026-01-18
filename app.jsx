const { useState, useEffect, useRef, useCallback } = React;

// Utility: Generate unique IDs
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Storage keys
const STORAGE_KEYS = {
  projectIndex: 'bookboard-index',
  projectPrefix: 'bookboard-project-',
  geminiKey: 'bookboard-gemini-key',
  lastOpenedProject: 'bookboard-last-opened',
  debugMode: 'bookboard-debug-mode'
};

// Debug log storage (in memory, not persisted)
let debugLog = [];
const log = (message, data = null) => {
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    data: data ? JSON.stringify(data, null, 2) : null
  };
  debugLog.push(entry);
  console.log(`[Bookboard] ${message}`, data || '');
};

const clearLog = () => {
  debugLog = [];
};

const getLogText = () => {
  return debugLog.map(entry => {
    let line = `[${entry.timestamp}] ${entry.message}`;
    if (entry.data) {
      line += `\n${entry.data}`;
    }
    return line;
  }).join('\n\n');
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
  const [showExtractConfirmModal, setShowExtractConfirmModal] = useState(false);
  const [showImportConflictModal, setShowImportConflictModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [editingEntity, setEditingEntity] = useState(null);
  const [editingChapterId, setEditingChapterId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.geminiKey) || '');
  const [debugMode, setDebugMode] = useState(() => localStorage.getItem(STORAGE_KEYS.debugMode) === 'true');

  // Save debug mode when it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.debugMode, debugMode.toString());
  }, [debugMode]);

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

  // Update chapter content
  const updateChapterContent = (chapterId, content) => {
    setCurrentProject(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => 
        ch.id === chapterId ? { ...ch, content } : ch
      )
    }));
  };

  // Update chapter title
  const updateChapterTitle = (chapterId, title) => {
    setCurrentProject(prev => ({
      ...prev,
      chapters: prev.chapters.map(ch => 
        ch.id === chapterId ? { ...ch, title } : ch
      )
    }));
  };

  // Get current editing chapter
  const editingChapter = editingChapterId 
    ? currentProject.chapters.find(ch => ch.id === editingChapterId)
    : null;

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

  // Find empty position for new entity card
  const findEmptyPosition = (existingPositions, startX = 80, startY = 60) => {
    const cardWidth = 240;
    const cardHeight = 200;
    const maxX = 1600;
    
    let x = startX;
    let y = startY;
    
    const isOverlapping = (testX, testY) => {
      return existingPositions.some(pos => {
        return Math.abs(testX - pos.x) < cardWidth && Math.abs(testY - pos.y) < cardHeight;
      });
    };
    
    let iterations = 0;
    while (isOverlapping(x, y) && iterations < 100) {
      x += cardWidth;
      if (x > maxX) {
        x = startX;
        y += cardHeight;
      }
      iterations++;
    }
    
    return { x, y };
  };

  // Handle extract button - check if entities exist
  const handleExtractClick = () => {
    if (currentProject.entities.length > 0) {
      setShowExtractConfirmModal(true);
    } else {
      setShowExtractModal(true);
    }
  };

  // Clear entities and start fresh extraction
  const handleClearAndExtract = () => {
    setCurrentProject(prev => ({ ...prev, entities: [] }));
    setShowExtractConfirmModal(false);
    setShowExtractModal(true);
  };

  // Add to existing entities
  const handleAddToExisting = () => {
    setShowExtractConfirmModal(false);
    setShowExtractModal(true);
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
    clearLog();
    
    try {
      const chapterCount = currentProject.chapters.length;
      log('Starting extraction', { chapterCount });

      // Build full text
      const fullText = currentProject.chapters.map((ch, i) => 
        `## Section ${i + 1}: ${ch.title}\n${ch.content}`
      ).join('\n\n');
      
      log('Full text prepared', { length: fullText.length });

      // Decide whether to chunk based on size
      const CHUNK_THRESHOLD = 200000;
      const needsChunking = fullText.length > CHUNK_THRESHOLD;
      
      let allNewEntities = [];

      if (!needsChunking) {
        // Single request for smaller documents
        log('Processing as single request');
        setLoadingMessage('Analysing manuscript...');
        
        const entities = await extractChunk(fullText, 1, chapterCount, chapterCount);
        log('Single request complete', { entities: entities?.length });
        if (entities) {
          allNewEntities = entities;
        }
      } else {
        // Chunk for larger documents
        const chunkSize = 3;
        const chunks = [];
        
        for (let i = 0; i < chapterCount; i += chunkSize) {
          chunks.push({
            chapters: currentProject.chapters.slice(i, i + chunkSize),
            startNum: i + 1
          });
        }
        
        log('Processing in chunks', { totalChunks: chunks.length, chunkSize });

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const { chapters, startNum } = chunks[chunkIndex];
          const endNum = startNum + chapters.length - 1;
          
          setLoadingMessage(`Analysing sections ${startNum}-${endNum} of ${chapterCount}...`);
          
          const chunkText = chapters.map((ch, i) => 
            `## Section ${startNum + i}: ${ch.title}\n${ch.content}`
          ).join('\n\n');
          
          log(`Processing chunk ${chunkIndex + 1}`, { startNum, endNum, textLength: chunkText.length });

          try {
            const entities = await extractChunk(chunkText, startNum, endNum, chapterCount);
            log(`Chunk ${chunkIndex + 1} complete`, { entities: entities?.length });
            if (entities) {
              allNewEntities.push(...entities);
            }
          } catch (error) {
            log('Chunk failed, continuing', { chunkIndex, error: error.message });
          }
        }
      }

      log('All API calls complete', { totalEntities: allNewEntities.length });

      if (allNewEntities.length === 0) {
        log('No entities extracted');
        alert('No entities could be extracted. Check the debug log for details.');
        setLoading(false);
        return;
      }

      // Deduplicate entities by name+type
      log('Starting deduplication');
      const seen = new Set();
      const deduped = [];
      for (const entity of allNewEntities) {
        const key = `${entity.type}:${entity.name.toLowerCase().trim()}`;
        if (!seen.has(key)) {
          seen.add(key);
          deduped.push(entity);
        } else {
          const existing = deduped.find(e => `${e.type}:${e.name.toLowerCase().trim()}` === key);
          if (existing && entity.chapterNums) {
            existing.chapterNums = [...new Set([...(existing.chapterNums || []), ...entity.chapterNums])].sort((a,b) => a-b);
          }
        }
      }
      
      log('Deduplication complete', { before: allNewEntities.length, after: deduped.length });

      // Position entities
      log('Starting positioning');
      const existingPositions = currentProject.entities.map(e => e.position || { x: 0, y: 0 });
      const newPositions = [];
      const finalEntities = [];
      
      for (let i = 0; i < deduped.length; i++) {
        const entity = deduped[i];
        const position = findEmptyPosition([...existingPositions, ...newPositions]);
        newPositions.push(position);
        
        finalEntities.push({
          ...entity,
          id: generateId('ent'),
          chapterRefs: (entity.chapterNums || [])
            .map(num => currentProject.chapters[num - 1]?.id)
            .filter(Boolean),
          position
        });
      }
      
      // Remove chapterNums from final entities
      finalEntities.forEach(e => delete e.chapterNums);

      log('Positioning complete', { count: finalEntities.length });

      log('Updating project state');
      setCurrentProject(prev => ({
        ...prev,
        entities: [...prev.entities, ...finalEntities]
      }));

      log('Extraction complete');
      setLoading(false);
      
    } catch (error) {
      log('FATAL ERROR', { message: error.message, stack: error.stack });
      console.error('Extraction error:', error);
      alert(`Extraction failed: ${error.message}`);
      setLoading(false);
    }
  };

  // Helper function to extract from a chunk of text
  const extractChunk = async (text, startNum, endNum, totalSections) => {
    const sectionCount = endNum - startNum + 1;
    const sectionRange = startNum === endNum ? `section ${startNum}` : `sections ${startNum}-${endNum}`;
    
    const prompt = `Analyse this text and extract entities. This is ${sectionRange} of a ${totalSections}-section work.

TEXT:
${text}

Extract:
1. CHARACTERS: People mentioned by name. Include their role/description and which section numbers they appear in (${startNum}-${endNum}).
2. THEMES: Major themes or motifs (typically 2-4 for this excerpt).
3. LOCATIONS: Named places or settings.
4. SCENES: Extract AT LEAST ONE significant scene per section. You have ${sectionCount} sections, so provide at least ${sectionCount} scenes. Each scene should capture the key action or development.

Use section numbers ${startNum}-${endNum} for chapterNums field.

Respond ONLY with valid JSON (no markdown fences, no explanation):
{
  "entities": [
    {"type": "character", "name": "Name", "description": "Brief description", "chapterNums": [${startNum}]},
    {"type": "theme", "name": "Theme Name", "description": "How it manifests", "chapterNums": [${startNum}]},
    {"type": "location", "name": "Place", "description": "Description", "chapterNums": [${startNum}]},
    {"type": "scene", "name": "Scene Title", "description": "What happens", "chapterNums": [${startNum}]}
  ]
}`;

    log('Sending API request', { sectionRange, promptLength: prompt.length });
    
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 16384,
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      log('API error', error);
      throw new Error(error.error?.message || 'API request failed');
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    log('API response received', { 
      contentLength: content?.length,
      finishReason: data.candidates?.[0]?.finishReason 
    });
    
    if (!content) {
      log('No content in response', data);
      throw new Error('No response from Gemini');
    }

    let cleanedContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    
    let parsed;
    try {
      parsed = JSON.parse(cleanedContent);
      log('JSON parsed successfully', { entityCount: parsed.entities?.length });
    } catch (parseError) {
      log('JSON parse error, attempting salvage', { error: parseError.message, content: cleanedContent.substring(0, 500) });
      
      // Try to salvage truncated JSON
      const lastCompleteEntity = cleanedContent.lastIndexOf('},');
      if (lastCompleteEntity > 0) {
        cleanedContent = cleanedContent.substring(0, lastCompleteEntity + 1) + ']}';
        try {
          parsed = JSON.parse(cleanedContent);
          log('Salvaged partial JSON', { entityCount: parsed.entities?.length });
        } catch (e) {
          log('Salvage failed', { error: e.message });
          throw new Error('Response was truncated and could not be recovered');
        }
      } else {
        throw new Error('Invalid JSON response');
      }
    }
    
    return parsed.entities || [];
  };

  // Render library or editor view
  if (view === 'library') {
    return (
      <div className="app-container">
        <div className="library-header">
          <h1>Bookboard</h1>
          <div className="library-actions">
            <button className="btn" onClick={() => setShowSettingsModal(true)}>Settings</button>
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

        {showSettingsModal && (
          <SettingsModal
            geminiKey={geminiKey}
            onGeminiKeyChange={setGeminiKey}
            debugMode={debugMode}
            onDebugModeChange={setDebugMode}
            onClose={() => setShowSettingsModal(false)}
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
        onExtract={handleExtractClick}
        hasChapters={currentProject.chapters.length > 0}
      />
      
      <div className="main-layout">
        <TimelinePanel 
          chapters={currentProject.chapters} 
          onReorder={reorderChapters}
          onChapterClick={(chapterId) => setEditingChapterId(chapterId)}
          editingChapterId={editingChapterId}
        />
        {editingChapter ? (
          <ChapterEditor
            chapter={editingChapter}
            chapterIndex={currentProject.chapters.findIndex(ch => ch.id === editingChapterId)}
            onUpdateContent={(content) => updateChapterContent(editingChapterId, content)}
            onUpdateTitle={(title) => updateChapterTitle(editingChapterId, title)}
            onClose={() => setEditingChapterId(null)}
          />
        ) : (
          <Corkboard 
            entities={currentProject.entities}
            chapters={currentProject.chapters}
            onUpdatePosition={updateEntityPosition}
            onEditEntity={(entity) => { setEditingEntity(entity); setShowEntityModal(true); }}
            onDeleteEntity={deleteEntity}
            isEmpty={currentProject.chapters.length === 0 && currentProject.entities.length === 0}
            onImport={() => setShowImportModal(true)}
          />
        )}
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

      {showExtractConfirmModal && (
        <ExtractConfirmModal
          entityCount={currentProject.entities.length}
          onClearAndExtract={handleClearAndExtract}
          onAddToExisting={handleAddToExisting}
          onCancel={() => setShowExtractConfirmModal(false)}
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
function TimelinePanel({ chapters, onReorder, onChapterClick, editingChapterId }) {
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
            className={`chapter-card ${dragIndex === index ? 'dragging' : ''} ${dragOverIndex === index ? 'drag-over' : ''} ${editingChapterId === chapter.id ? 'selected' : ''}`}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            onClick={() => onChapterClick(chapter.id)}
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

// Chapter Editor Component
function ChapterEditor({ chapter, chapterIndex, onUpdateContent, onUpdateTitle, onClose }) {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content);
  const textareaRef = useRef(null);

  // Sync state when chapter changes
  useEffect(() => {
    setTitle(chapter.title);
    setContent(chapter.content);
  }, [chapter.id, chapter.title, chapter.content]);

  // Also save on every change for auto-save feel
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content !== chapter.content) {
        onUpdateContent(content);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [content, chapter.content, onUpdateContent]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (title !== chapter.title) {
        onUpdateTitle(title);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [title, chapter.title, onUpdateTitle]);

  // Word count
  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;

  return (
    <div className="chapter-editor">
      <div className="chapter-editor-header">
        <button className="btn btn-back" onClick={onClose} title="Back to corkboard">←</button>
        <span className="chapter-editor-label">Chapter {chapterIndex + 1}</span>
        <input
          type="text"
          className="chapter-editor-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Chapter title..."
        />
        <span className="chapter-editor-wordcount">{wordCount.toLocaleString()} words</span>
      </div>
      <textarea
        ref={textareaRef}
        className="chapter-editor-content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Start writing..."
      />
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

// Extract Confirm Modal (when entities already exist)
function ExtractConfirmModal({ entityCount, onClearAndExtract, onAddToExisting, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Entities Already Exist</h2>
        <p style={{ marginBottom: '24px' }}>
          This project already has <strong>{entityCount}</strong> cards on the corkboard. What would you like to do?
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button className="btn btn-primary" onClick={onClearAndExtract}>
            Clear All & Re-extract
          </button>
          <p className="help-text" style={{ marginTop: '-4px' }}>
            Remove all existing cards and extract fresh from the manuscript.
          </p>
          
          <button className="btn btn-secondary" onClick={onAddToExisting}>
            Add to Existing
          </button>
          <p className="help-text" style={{ marginTop: '-4px' }}>
            Keep existing cards and add newly extracted ones.
          </p>
          
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

// Settings Modal Component
function SettingsModal({ geminiKey, onGeminiKeyChange, debugMode, onDebugModeChange, onClose }) {
  const [showKey, setShowKey] = useState(false);
  
  const downloadLog = () => {
    const logText = getLogText();
    if (!logText) {
      alert('No debug log available. Run an extraction first with debug mode enabled.');
      return;
    }
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookboard-debug-${new Date().toISOString().slice(0, 10)}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>
        
        <div className="settings-section">
          <h3>Gemini API Key</h3>
          <p className="help-text" style={{ marginBottom: '12px' }}>
            Used for automatic entity extraction (characters, themes, locations, scenes).
          </p>
          
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={geminiKey}
              onChange={(e) => onGeminiKeyChange(e.target.value)}
              placeholder="AIzaSy..."
              style={{ fontFamily: "'JetBrains Mono', monospace", paddingRight: '60px' }}
            />
            <button 
              type="button"
              className="btn-show-hide"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          
          <div className="api-key-help">
            <h4>How to get your Gemini API key:</h4>
            <ol>
              <li>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a></li>
              <li>Sign in with your Google account</li>
              <li>Click <strong>"Create API key"</strong></li>
              <li>Choose a project (or create one) and click <strong>"Create"</strong></li>
              <li>Copy the key and paste it above</li>
            </ol>
            <p className="help-text" style={{ marginTop: '12px' }}>
              The free tier includes 15 requests/minute. If you have Gemini Pro, you get higher limits.
              Your key is stored only in your browser—it's never sent anywhere except directly to Google's API.
            </p>
          </div>
        </div>

        <div className="settings-section">
          <h3>Debug Mode</h3>
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => onDebugModeChange(e.target.checked)}
            />
            <span>Enable debug logging</span>
          </label>
          <p className="help-text" style={{ marginTop: '8px' }}>
            When enabled, extraction operations are logged for troubleshooting.
          </p>
          {debugMode && (
            <button className="btn" style={{ marginTop: '12px' }} onClick={downloadLog}>
              Download Debug Log
            </button>
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
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
        
        {geminiKey ? (
          <div className="api-key-section">
            <p style={{ color: 'var(--green-pin)', marginBottom: '12px' }}>
              ✓ Gemini API key configured
            </p>
            <p className="help-text">
              You can update your key in Settings from the library view.
            </p>
          </div>
        ) : (
          <div className="api-key-section">
            <label>Gemini API Key</label>
            <input
              type="password"
              value={geminiKey}
              onChange={(e) => onGeminiKeyChange(e.target.value)}
              placeholder="AIzaSy..."
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            />
            <p className="help-text" style={{ marginTop: '8px' }}>
              Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--blue-pin)' }}>aistudio.google.com/apikey</a> — or configure it in Settings.
            </p>
          </div>
        )}

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
