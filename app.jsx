const { useState, useEffect, useRef, useCallback } = React;

// Utility: Generate unique IDs
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// App version
const APP_VERSION = '2.3';

// Storage keys (all local-only, not synced to Drive)
const STORAGE_KEYS = {
  projectIndex: 'bookboard-index',
  projectPrefix: 'bookboard-project-',
  geminiKey: 'bookboard-gemini-key',
  googleClientId: 'bookboard-google-client-id',
  lastOpenedProject: 'bookboard-last-opened',
  debugMode: 'bookboard-debug-mode'
};

// Google Drive API configuration
const DRIVE_FOLDER_NAME = 'Bookboard';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file';

// Google Drive helper functions
let googleTokenClient = null;
let googleAccessToken = null;

const initGoogleAuth = (clientId, onSuccess, onError) => {
  if (!clientId) {
    onError('No Google Client ID configured');
    return;
  }
  
  try {
    googleTokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPES,
      callback: (response) => {
        if (response.access_token) {
          googleAccessToken = response.access_token;
          onSuccess(response.access_token);
        } else {
          onError('Failed to get access token');
        }
      },
      error_callback: (error) => {
        onError(error.message || 'Auth failed');
      }
    });
  } catch (e) {
    onError(e.message);
  }
};

const requestGoogleAuth = () => {
  if (googleTokenClient) {
    googleTokenClient.requestAccessToken();
  }
};

const getOrCreateBookboardFolder = async (accessToken) => {
  // Search for existing folder
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchResponse.json();
  
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }
  
  // Create folder if it doesn't exist
  const createResponse = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    })
  });
  const createData = await createResponse.json();
  return createData.id;
};

const saveProjectToDrive = async (accessToken, project) => {
  const folderId = await getOrCreateBookboardFolder(accessToken);
  const fileName = `${project.id}.json`;
  
  // Check if file already exists
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchResponse.json();
  
  const projectData = JSON.stringify(project, null, 2);
  const blob = new Blob([projectData], { type: 'application/json' });
  
  const metadata = {
    name: fileName,
    mimeType: 'application/json'
  };
  
  if (searchData.files && searchData.files.length > 0) {
    // Update existing file
    const fileId = searchData.files[0].id;
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
  } else {
    // Create new file
    metadata.parents = [folderId];
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    
    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form
    });
  }
  
  return true;
};

const listDriveProjects = async (accessToken) => {
  const folderId = await getOrCreateBookboardFolder(accessToken);
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents and mimeType='application/json' and trashed=false&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json();
  return data.files || [];
};

const loadProjectFromDrive = async (accessToken, fileId) => {
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const project = await response.json();
  return project;
};

const deleteProjectFromDrive = async (accessToken, projectId) => {
  const folderId = await getOrCreateBookboardFolder(accessToken);
  const fileName = `${projectId}.json`;
  
  const searchResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=name='${fileName}' and '${folderId}' in parents and trashed=false&fields=files(id)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const searchData = await searchResponse.json();
  
  if (searchData.files && searchData.files.length > 0) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${searchData.files[0].id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }
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
  customFolders: [], // User-defined folders (array of strings)
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
  const [showAddFolderModal, setShowAddFolderModal] = useState(false);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [editingEntity, setEditingEntity] = useState(null);
  const [editingChapterId, setEditingChapterId] = useState(null);
  const [defaultEntityType, setDefaultEntityType] = useState(null); // For add button in folders
  const [bookType, setBookType] = useState('novel'); // 'novel' or 'collection'
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.geminiKey) || '');
  const [googleClientId, setGoogleClientId] = useState(() => localStorage.getItem(STORAGE_KEYS.googleClientId) || '');
  const [googleAuthStatus, setGoogleAuthStatus] = useState('not_configured'); // 'not_configured', 'signed_out', 'signed_in'
  const [driveProjects, setDriveProjects] = useState([]);
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

  // Save Google Client ID when it changes
  useEffect(() => {
    if (googleClientId) {
      localStorage.setItem(STORAGE_KEYS.googleClientId, googleClientId);
      setGoogleAuthStatus('signed_out');
    } else {
      setGoogleAuthStatus('not_configured');
    }
  }, [googleClientId]);

  // Initialize Google Auth when client ID is available
  useEffect(() => {
    if (googleClientId && typeof google !== 'undefined') {
      initGoogleAuth(
        googleClientId,
        (token) => {
          setGoogleAuthStatus('signed_in');
          // Refresh drive projects list
          listDriveProjects(token).then(setDriveProjects).catch(console.error);
        },
        (error) => {
          console.error('Google auth error:', error);
          setGoogleAuthStatus('signed_out');
        }
      );
    }
  }, [googleClientId]);

  // Handle Google Sign In
  const handleGoogleSignIn = () => {
    if (!googleClientId) {
      alert('Please configure your Google Client ID in Settings first.');
      setShowSettingsModal(true);
      return;
    }
    requestGoogleAuth();
  };

  // Save current project to Drive
  const handleSaveToDrive = async () => {
    if (!googleAccessToken || !currentProject) return;
    
    setLoading(true);
    setLoadingMessage('Saving to Google Drive...');
    try {
      await saveProjectToDrive(googleAccessToken, currentProject);
      const projects = await listDriveProjects(googleAccessToken);
      setDriveProjects(projects);
      alert('Project saved to Google Drive!');
    } catch (error) {
      console.error('Save to Drive error:', error);
      alert('Failed to save to Drive: ' + error.message);
    }
    setLoading(false);
  };

  // Save all local projects to Drive
  const handleSaveAllToDrive = async () => {
    if (!googleAccessToken) return;
    
    setLoading(true);
    const index = loadProjectIndex();
    for (let i = 0; i < index.length; i++) {
      setLoadingMessage(`Saving to Drive... (${i + 1}/${index.length})`);
      const project = loadProject(index[i].id);
      if (project) {
        try {
          await saveProjectToDrive(googleAccessToken, project);
        } catch (error) {
          console.error(`Failed to save ${project.title}:`, error);
        }
      }
    }
    const projects = await listDriveProjects(googleAccessToken);
    setDriveProjects(projects);
    setLoading(false);
    alert('All projects saved to Google Drive!');
  };

  // Load a project from Drive
  const handleLoadFromDrive = async (fileId, fileName) => {
    if (!googleAccessToken) return;
    
    setLoading(true);
    setLoadingMessage('Loading from Google Drive...');
    try {
      const project = await loadProjectFromDrive(googleAccessToken, fileId);
      
      // Check if project with same ID exists locally
      const existingLocal = loadProject(project.id);
      if (existingLocal) {
        const useLocal = confirm(
          `"${project.title}" exists locally (updated ${new Date(existingLocal.updatedAt).toLocaleString()}).\n` +
          `Drive version updated ${new Date(project.updatedAt).toLocaleString()}.\n\n` +
          `Click OK to replace local with Drive version, or Cancel to keep local.`
        );
        if (!useLocal) {
          setLoading(false);
          return;
        }
      }
      
      // Save to local storage
      saveProject(project);
      setProjectIndex(loadProjectIndex());
      setShowDriveModal(false);
      alert(`Loaded "${project.title}" from Drive!`);
    } catch (error) {
      console.error('Load from Drive error:', error);
      alert('Failed to load from Drive: ' + error.message);
    }
    setLoading(false);
  };

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
      // Ensure customFolders exists for older projects
      if (!project.customFolders) {
        project.customFolders = [];
      }
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

  // Add custom folder
  const addCustomFolder = (folderName) => {
    if (!folderName.trim()) return;
    setCurrentProject(prev => ({
      ...prev,
      customFolders: [...(prev.customFolders || []), folderName.trim()]
    }));
    setShowAddFolderModal(false);
  };

  // Delete custom folder
  const deleteCustomFolder = (folderName) => {
    if (confirm(`Delete folder "${folderName}"? Cards in this folder will be unassigned but not deleted.`)) {
      setCurrentProject(prev => ({
        ...prev,
        customFolders: (prev.customFolders || []).filter(f => f !== folderName),
        entities: prev.entities.map(e => e.folder === folderName ? { ...e, folder: null } : e)
      }));
    }
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

  // Toggle star on entity
  const toggleStar = (id) => {
    setCurrentProject(prev => ({
      ...prev,
      entities: prev.entities.map(e => 
        e.id === id ? { ...e, starred: !e.starred } : e
      )
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
    setDefaultEntityType(null);
  };

  // Merge two entities of the same type
  const mergeEntities = (keepEntity, mergeEntity) => {
    setCurrentProject(prev => {
      const merged = {
        ...keepEntity,
        description: [keepEntity.description, mergeEntity.description].filter(Boolean).join('\n\n'),
        chapterRefs: [...new Set([...(keepEntity.chapterRefs || []), ...(mergeEntity.chapterRefs || [])])],
        storyRefs: keepEntity.storyRefs || mergeEntity.storyRefs 
          ? [...new Set([...(keepEntity.storyRefs || []), ...(mergeEntity.storyRefs || [])])]
          : undefined
      };
      return {
        ...prev,
        entities: prev.entities
          .filter(e => e.id !== mergeEntity.id)
          .map(e => e.id === keepEntity.id ? merged : e)
      };
    });
    setShowMergeModal(false);
  };

  // Rearrange entities in a folder to grid layout
  const rearrangeEntities = (entityIds) => {
    setCurrentProject(prev => {
      // Get the entities to rearrange
      const toRearrange = prev.entities.filter(e => entityIds.includes(e.id));
      
      // Sort by first chapter/story appearance
      const extractableChapters = prev.chapters.filter(ch => !ch.isFrontMatter);
      toRearrange.sort((a, b) => {
        const getFirstAppearance = (entity) => {
          if (entity.chapterRefs && entity.chapterRefs.length > 0) {
            const indices = entity.chapterRefs
              .map(ref => extractableChapters.findIndex(ch => ch.id === ref))
              .filter(i => i >= 0);
            return indices.length > 0 ? Math.min(...indices) : 999;
          }
          return 999;
        };
        return getFirstAppearance(a) - getFirstAppearance(b);
      });
      
      // Calculate new positions in grid
      const cardWidth = 240;
      const cardHeight = 180;
      const cardsPerRow = 5;
      const startX = 40;
      const startY = 40;
      
      const newPositions = {};
      toRearrange.forEach((entity, i) => {
        const col = i % cardsPerRow;
        const row = Math.floor(i / cardsPerRow);
        newPositions[entity.id] = { x: startX + col * cardWidth, y: startY + row * cardHeight };
      });
      
      return {
        ...prev,
        entities: prev.entities.map(e => 
          newPositions[e.id] ? { ...e, position: newPositions[e.id] } : e
        )
      };
    });
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
    let frontMatterBuffer = [];
    let foundFirstChapter = false;

    for (const line of lines) {
      const h1Match = line.match(/^#\s+(.+)$/);
      const h2Match = line.match(/^##\s+(.+)$/);
      
      if (h1Match && bookTitle === null) {
        bookTitle = h1Match[1];
        continue;
      }
      
      if (h2Match) {
        // Save any front matter before first chapter
        if (!foundFirstChapter && frontMatterBuffer.length > 0) {
          const frontMatterContent = frontMatterBuffer.join('\n').trim();
          if (frontMatterContent) {
            chapters.push({
              id: generateId('ch'),
              title: 'Front Matter',
              content: frontMatterContent,
              order: 0,
              isFrontMatter: true
            });
          }
        }
        foundFirstChapter = true;
        
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
      } else if (bookTitle !== null) {
        // Content after title but before first chapter = front matter
        frontMatterBuffer.push(line);
      }
    }

    if (currentChapter) {
      currentChapter.content = contentBuffer.join('\n').trim();
      chapters.push(currentChapter);
    }

    if (chapters.length === 0) {
      return parseMarkdownFallback(markdown);
    }

    // Re-number chapters to ensure front matter is 0 and others start at 1
    chapters.forEach((ch, i) => {
      if (ch.isFrontMatter) {
        ch.order = 0;
      } else {
        ch.order = i + (chapters[0]?.isFrontMatter ? 0 : 1);
      }
    });

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
          const metadata = [];
          if (entity.folder) {
            metadata.push(`Folder: ${entity.folder}`);
          }
          if (entity.chapterRefs?.length > 0) {
            const chapterNames = entity.chapterRefs
              .map(id => {
                const ch = currentProject.chapters.find(c => c.id === id);
                return ch ? ch.title : null;
              })
              .filter(Boolean);
            if (chapterNames.length > 0) {
              metadata.push(`Appears in: ${chapterNames.join(', ')}`);
            }
          }
          if (metadata.length > 0) {
            md += `*${metadata.join(' | ')}*\n\n`;
          }
        });
      }
    });

    // Custom folders section
    const customFolders = currentProject.customFolders || [];
    if (customFolders.length > 0) {
      md += `## Custom Folders\n\n`;
      customFolders.forEach(folder => {
        const folderEntities = currentProject.entities.filter(e => e.folder === folder);
        md += `### ${folder}\n\n`;
        if (folderEntities.length === 0) {
          md += `*Empty*\n\n`;
        } else {
          folderEntities.forEach(entity => {
            md += `- **${entity.name}** (${entity.type})${entity.description ? `: ${entity.description.substring(0, 100)}${entity.description.length > 100 ? '...' : ''}` : ''}\n`;
          });
          md += `\n`;
        }
      });
    }

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
  const extractEntities = async (isCollection = false) => {
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
      // Filter out front matter from extraction
      const extractableChapters = currentProject.chapters.filter(ch => !ch.isFrontMatter);
      const chapterCount = extractableChapters.length;
      log('Starting extraction', { chapterCount, isCollection });

      // Build full text
      const fullText = extractableChapters.map((ch, i) => 
        `## ${isCollection ? 'Story' : 'Section'} ${i + 1}: ${ch.title}\n${ch.content}`
      ).join('\n\n');
      
      log('Full text prepared', { length: fullText.length });

      // Decide whether to chunk based on size
      const CHUNK_THRESHOLD = 200000;
      let needsChunking = fullText.length > CHUNK_THRESHOLD;
      
      let allNewEntities = [];

      if (!needsChunking) {
        // Try single request for smaller documents
        log('Attempting single request');
        setLoadingMessage('Analysing manuscript...');
        
        const result = await extractChunk(fullText, 1, chapterCount, chapterCount, isCollection, extractableChapters);
        log('Single request complete', { entities: result.entities?.length, hitMaxTokens: result.hitMaxTokens });
        
        if (result.hitMaxTokens) {
          // Retry with chunking
          log('MAX_TOKENS hit, falling back to chunked extraction');
          needsChunking = true;
        } else if (result.entities) {
          allNewEntities = result.entities;
        }
      }
      
      if (needsChunking) {
        // Chunk for larger documents or when single request hit token limit
        const chunkSize = 3;
        const chunks = [];
        
        for (let i = 0; i < chapterCount; i += chunkSize) {
          chunks.push({
            chapters: extractableChapters.slice(i, i + chunkSize),
            startNum: i + 1
          });
        }
        
        log('Processing in chunks', { totalChunks: chunks.length, chunkSize });
        allNewEntities = []; // Reset in case we had partial results from failed single request

        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
          const { chapters, startNum } = chunks[chunkIndex];
          const endNum = startNum + chapters.length - 1;
          
          setLoadingMessage(`Analysing ${isCollection ? 'stories' : 'sections'} ${startNum}-${endNum} of ${chapterCount}...`);
          
          const chunkText = chapters.map((ch, i) => 
            `## ${isCollection ? 'Story' : 'Section'} ${startNum + i}: ${ch.title}\n${ch.content}`
          ).join('\n\n');
          
          log(`Processing chunk ${chunkIndex + 1}`, { startNum, endNum, textLength: chunkText.length });

          try {
            const result = await extractChunk(chunkText, startNum, endNum, chapterCount, isCollection, extractableChapters);
            log(`Chunk ${chunkIndex + 1} complete`, { entities: result.entities?.length });
            if (result.entities) {
              allNewEntities.push(...result.entities);
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

      // Deduplicate entities by name+type (only for novels, not collections)
      let processedEntities = allNewEntities;
      if (!isCollection) {
        log('Starting deduplication (novel mode)');
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
        processedEntities = deduped;
      } else {
        log('Skipping deduplication (collection mode)');
      }

      // Position entities in a grid, sorted by first chapter appearance
      log('Starting positioning');
      
      // Sort by type first, then by first chapter appearance
      processedEntities.sort((a, b) => {
        const typeOrder = ['scene', 'character', 'location', 'theme', 'idea'];
        const typeA = typeOrder.indexOf(a.type);
        const typeB = typeOrder.indexOf(b.type);
        if (typeA !== typeB) return typeA - typeB;
        
        const firstChA = Math.min(...(a.chapterNums || [999]));
        const firstChB = Math.min(...(b.chapterNums || [999]));
        return firstChA - firstChB;
      });
      
      const finalEntities = processedEntities.map((entity, i) => {
        // Grid positioning: fit to reasonable viewport width
        const cardWidth = 240;
        const cardHeight = 180;
        const cardsPerRow = 5;
        const startX = 40;
        const startY = 40;
        
        const col = i % cardsPerRow;
        const row = Math.floor(i / cardsPerRow);
        
        return {
          ...entity,
          id: generateId('ent'),
          chapterRefs: (entity.chapterNums || [])
            .map(num => extractableChapters[num - 1]?.id)
            .filter(Boolean),
          // For collections, store story titles instead of chapter refs
          storyRefs: isCollection ? (entity.chapterNums || [])
            .map(num => extractableChapters[num - 1]?.title)
            .filter(Boolean) : undefined,
          position: { x: startX + col * cardWidth, y: startY + row * cardHeight }
        };
      });
      
      // Remove chapterNums from final entities
      finalEntities.forEach(e => delete e.chapterNums);

      log('Positioning complete', { count: finalEntities.length });

      log('Updating project state');
      setCurrentProject(prev => ({
        ...prev,
        bookType: isCollection ? 'collection' : 'novel',
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
  // Returns { entities: [...], hitMaxTokens: boolean }
  const extractChunk = async (text, startNum, endNum, totalSections, isCollection = false, chapters = []) => {
    const sectionCount = endNum - startNum + 1;
    const unitName = isCollection ? 'story' : 'section';
    const unitNamePlural = isCollection ? 'stories' : 'sections';
    const sectionRange = startNum === endNum ? `${unitName} ${startNum}` : `${unitNamePlural} ${startNum}-${endNum}`;
    
    // Build story titles list for collection mode
    const storyTitles = isCollection ? chapters.slice(startNum - 1, endNum).map((ch, i) => 
      `${startNum + i}: "${ch.title}"`
    ).join(', ') : '';
    
    // IMPORTANT: Scenes first in the prompt since they're most likely to be cut off by token limits
    const collectionNote = isCollection ? `
IMPORTANT: This is a SHORT STORY COLLECTION. Each story is INDEPENDENT. Characters with the same name in different stories are DIFFERENT PEOPLE. Do NOT merge or deduplicate characters across stories.
Story titles: ${storyTitles}
` : '';

    const prompt = `Analyse this text and extract entities. This is ${sectionRange} of a ${totalSections}-${unitName} work.
${collectionNote}
TEXT:
${text}

Extract (in this order - SCENES FIRST as they are most important):

1. SCENES: Extract AT LEAST ONE significant scene per ${unitName}. You have ${sectionCount} ${unitNamePlural} (${startNum}-${endNum}), so provide at least ${sectionCount} scenes. Each scene should capture the key action, conflict, or development in that ${unitName}.

2. CHARACTERS: People mentioned by name. Include their role/description and which ${unitName} numbers they appear in.${isCollection ? ' Remember: same name in different stories = different characters.' : ''}

3. LOCATIONS: Named places or settings.

4. THEMES: Major themes or motifs (typically 2-4 for this excerpt).

Use ${unitName} numbers ${startNum}-${endNum} for the chapterNums field.

Respond ONLY with valid JSON (no markdown fences, no explanation):
{
  "entities": [
    {"type": "scene", "name": "Scene Title", "description": "What happens", "chapterNums": [${startNum}]},
    {"type": "character", "name": "Name", "description": "Brief description", "chapterNums": [${startNum}]},
    {"type": "location", "name": "Place", "description": "Description", "chapterNums": [${startNum}]},
    {"type": "theme", "name": "Theme Name", "description": "How it manifests", "chapterNums": [${startNum}]}
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
          maxOutputTokens: 65536, // Maximum allowed for Gemini 2.5 Flash
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
    const finishReason = data.candidates?.[0]?.finishReason;
    const hitMaxTokens = finishReason === 'MAX_TOKENS';
    
    log('API response received', { 
      contentLength: content?.length,
      finishReason,
      hitMaxTokens
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
    
    return { entities: parsed.entities || [], hitMaxTokens };
  };

  // Render library or editor view
  if (view === 'library') {
    return (
      <div className="app-container">
        <div className="library-header">
          <h1>Bookboard</h1>
          <div className="library-actions">
            {googleAuthStatus === 'signed_in' ? (
              <>
                <button className="btn btn-drive" onClick={() => setShowDriveModal(true)} title="Google Drive">
                  ☁️ Drive
                </button>
                <button className="btn btn-drive" onClick={handleSaveAllToDrive} title="Save all to Drive">
                  ⬆️ Sync All
                </button>
              </>
            ) : googleAuthStatus === 'signed_out' ? (
              <button className="btn btn-drive" onClick={handleGoogleSignIn} title="Sign in to Google">
                ☁️ Sign In
              </button>
            ) : null}
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
              {googleAuthStatus === 'signed_in' && driveProjects.length > 0 && (
                <p style={{ marginTop: '16px' }}>
                  Or <button className="btn-link" onClick={() => setShowDriveModal(true)}>load from Google Drive</button>
                </p>
              )}
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

        {showDriveModal && (
          <DriveModal
            projects={driveProjects}
            onLoad={handleLoadFromDrive}
            onRefresh={async () => {
              if (googleAccessToken) {
                const projects = await listDriveProjects(googleAccessToken);
                setDriveProjects(projects);
              }
            }}
            onClose={() => setShowDriveModal(false)}
          />
        )}

        {showSettingsModal && (
          <SettingsModal
            geminiKey={geminiKey}
            onGeminiKeyChange={setGeminiKey}
            googleClientId={googleClientId}
            onGoogleClientIdChange={setGoogleClientId}
            googleAuthStatus={googleAuthStatus}
            onGoogleSignIn={handleGoogleSignIn}
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
        googleAuthStatus={googleAuthStatus}
        onSaveToDrive={handleSaveToDrive}
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
            key={currentProject.id}
            entities={currentProject.entities}
            chapters={currentProject.chapters}
            customFolders={currentProject.customFolders || []}
            onUpdatePosition={updateEntityPosition}
            onEditEntity={(entity) => { setEditingEntity(entity); setShowEntityModal(true); }}
            onDeleteEntity={deleteEntity}
            onToggleStar={toggleStar}
            isEmpty={currentProject.chapters.length === 0 && currentProject.entities.length === 0}
            onImport={() => setShowImportModal(true)}
            onAddEntity={(type, folder) => { 
              setDefaultEntityType(type); 
              setEditingEntity(folder ? { folder } : null); 
              setShowEntityModal(true); 
            }}
            onAddFolder={() => setShowAddFolderModal(true)}
            onDeleteCustomFolder={deleteCustomFolder}
            onMergeEntities={(selected) => mergeEntities(selected[0], selected[1])}
            onRearrangeEntities={rearrangeEntities}
          />
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
          customFolders={currentProject.customFolders || []}
          defaultType={defaultEntityType}
          onSave={saveEntity}
          onClose={() => { setShowEntityModal(false); setEditingEntity(null); setDefaultEntityType(null); }}
        />
      )}

      {showAddFolderModal && (
        <AddFolderModal
          existingFolders={currentProject.customFolders || []}
          onAdd={addCustomFolder}
          onClose={() => setShowAddFolderModal(false)}
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
function TopBar({ title, onTitleChange, onLibrary, onImport, onExport, onExtract, hasChapters, googleAuthStatus, onSaveToDrive }) {
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
      {googleAuthStatus === 'signed_in' && (
        <button className="btn btn-drive" onClick={onSaveToDrive} title="Save to Google Drive">☁️</button>
      )}
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

// Corkboard Component with Folder Navigation
function Corkboard({ 
  entities, 
  chapters, 
  customFolders = [],
  onUpdatePosition, 
  onEditEntity, 
  onDeleteEntity,
  onToggleStar,
  isEmpty, 
  onImport,
  onAddEntity,
  onAddFolder,
  onDeleteCustomFolder,
  onMergeEntities,
  onRearrangeEntities
}) {
  const [activeFolder, setActiveFolder] = useState(null);
  const [isCustomFolder, setIsCustomFolder] = useState(false);
  const [isKeyFolder, setIsKeyFolder] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  
  // ESC key to go back or clear selection
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (selectedForMerge.length > 0) {
          setSelectedForMerge([]);
        } else if (activeFolder) {
          setActiveFolder(null);
          setIsCustomFolder(false);
          setIsKeyFolder(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFolder, selectedForMerge]);
  
  // Clear selection when changing folders
  useEffect(() => {
    setSelectedForMerge([]);
  }, [activeFolder]);
  
  // Toggle entity selection for merge
  const toggleMergeSelection = (entity) => {
    setSelectedForMerge(prev => {
      if (prev.find(e => e.id === entity.id)) {
        return prev.filter(e => e.id !== entity.id);
      }
      // Only allow selecting same type
      if (prev.length > 0 && prev[0].type !== entity.type) {
        return prev; // Ignore if different type
      }
      if (prev.length >= 2) {
        return prev; // Max 2 for merge
      }
      return [...prev, entity];
    });
  };
  
  // Entity types for folders
  const entityTypes = [
    { type: 'scene', label: 'Scenes', keyLabel: 'Key Scenes', icon: '🎬' },
    { type: 'character', label: 'Characters', keyLabel: 'Key Characters', icon: '👤' },
    { type: 'location', label: 'Locations', keyLabel: 'Key Locations', icon: '📍' },
    { type: 'theme', label: 'Themes', keyLabel: 'Key Themes', icon: '💡' },
    { type: 'idea', label: 'Ideas', keyLabel: 'Key Ideas', icon: '📝' }
  ];
  
  // Reserved folder names (can't create custom folders with these names)
  const reservedFolderNames = entityTypes.map(et => et.keyLabel.toLowerCase());
  
  // Count entities per type
  const getCounts = () => {
    const counts = {};
    entityTypes.forEach(et => {
      counts[et.type] = entities.filter(e => e.type === et.type).length;
    });
    return counts;
  };
  
  // Count starred entities per type
  const getStarredCounts = () => {
    const counts = {};
    entityTypes.forEach(et => {
      counts[et.type] = entities.filter(e => e.type === et.type && e.starred).length;
    });
    return counts;
  };
  
  // Count entities per custom folder
  const getCustomFolderCounts = () => {
    const counts = {};
    (customFolders || []).forEach(folder => {
      counts[folder] = entities.filter(e => e.folder === folder).length;
    });
    return counts;
  };
  
  const counts = getCounts();
  const starredCounts = getStarredCounts();
  const customCounts = getCustomFolderCounts();
  
  // Get entities for current view
  const getFolderEntities = () => {
    if (!activeFolder) return [];
    if (isKeyFolder) {
      // Key folder: starred entities of that type
      return entities.filter(e => e.type === activeFolder && e.starred);
    }
    if (isCustomFolder) {
      return entities.filter(e => e.folder === activeFolder);
    }
    return entities.filter(e => e.type === activeFolder);
  };
  
  const folderEntities = getFolderEntities();
  const activeFolderInfo = entityTypes.find(et => et.type === activeFolder);
  
  // Handle add button click
  const handleAddClick = () => {
    if (activeFolder && !isCustomFolder) {
      // Inside a type folder - add entity with that type
      onAddEntity(activeFolder);
    } else if (activeFolder && isCustomFolder) {
      // Inside a custom folder - add entity and assign to this folder
      onAddEntity(null, activeFolder);
    } else {
      // At top level - add a new custom folder
      onAddFolder();
    }
  };
  
  if (isEmpty && (!customFolders || customFolders.length === 0)) {
    return (
      <div className="corkboard">
        <div className="empty-state">
          <h2>Your corkboard is empty</h2>
          <p>
            Import a manuscript (Markdown) or a project file (JSON) to get started.
            You can also manually add cards using the + button.
          </p>
          <button className="btn btn-primary" onClick={onImport}>Import</button>
        </div>
        <button className="add-entity-btn" onClick={handleAddClick} title="Add folder">+</button>
      </div>
    );
  }
  
  // Folder view - showing cards of one type or custom folder
  if (activeFolder) {
    return (
      <div className="corkboard">
        <div className="folder-view-header">
          <button className="btn" onClick={() => { setActiveFolder(null); setIsCustomFolder(false); }}>← Back</button>
          {isCustomFolder ? (
            <>
              <span className="folder-icon custom">📁</span>
              <h3>{activeFolder}</h3>
              <span className="folder-count">{folderEntities.length} cards</span>
              <button 
                className="btn btn-delete-folder" 
                onClick={() => { onDeleteCustomFolder(activeFolder); setActiveFolder(null); setIsCustomFolder(false); }}
                title="Delete folder"
              >
                🗑️
              </button>
            </>
          ) : (
            <>
              <span className={`folder-icon ${activeFolder}`}>{activeFolderInfo?.icon}</span>
              <h3>{activeFolderInfo?.label}</h3>
              <span className="folder-count">{folderEntities.length} cards</span>
            </>
          )}
          {folderEntities.length >= 2 && (
            <>
              <button 
                className="btn btn-rearrange"
                onClick={() => onRearrangeEntities(folderEntities.map(e => e.id))}
                title="Rearrange cards in grid"
              >
                ⊞
              </button>
              <button 
                className={`btn btn-merge ${selectedForMerge.length === 2 ? 'ready' : ''}`}
                onClick={() => {
                  if (selectedForMerge.length === 2) {
                    onMergeEntities(selectedForMerge);
                    setSelectedForMerge([]);
                  }
                }}
                disabled={selectedForMerge.length !== 2}
                title={selectedForMerge.length === 2 ? "Merge selected cards" : "Shift+click 2 cards to merge"}
              >
                {selectedForMerge.length === 2 ? '🔗 Merge' : '🔗'}
              </button>
            </>
          )}
          <span className="esc-hint">{selectedForMerge.length > 0 ? 'ESC to clear selection' : 'ESC to go back'}</span>
        </div>
        <div className="folder-contents">
          <div className="corkboard-inner">
            {folderEntities.map(entity => (
              <EntityCard
                key={entity.id}
                entity={entity}
                chapters={chapters}
                onUpdatePosition={onUpdatePosition}
                onEdit={() => onEditEntity(entity)}
                onDelete={() => onDeleteEntity(entity.id)}
                onToggleStar={!isCustomFolder ? () => onToggleStar(entity.id) : null}
                isSelected={selectedForMerge.some(e => e.id === entity.id)}
                onShiftClick={() => toggleMergeSelection(entity)}
              />
            ))}
          </div>
        </div>
        {!isKeyFolder && (
          <button className="add-entity-btn" onClick={handleAddClick} title="Add card">+</button>
        )}
      </div>
    );
  }
  
  // Top-level folder view
  return (
    <div className="corkboard">
      <div className="folder-grid">
        {/* Type-based folders */}
        {entityTypes.map(et => (
          <div 
            key={et.type}
            className={`entity-folder ${et.type}`}
            onClick={() => { setActiveFolder(et.type); setIsCustomFolder(false); setIsKeyFolder(false); }}
            style={{ opacity: counts[et.type] === 0 ? 0.5 : 1 }}
          >
            <div className="folder-icon">{et.icon}</div>
            <div className="folder-label">{et.label}</div>
            <div className="folder-count">{counts[et.type]} cards</div>
          </div>
        ))}
        
        {/* Key folders (only shown if starred entities exist) */}
        {entityTypes.filter(et => starredCounts[et.type] > 0).map(et => (
          <div 
            key={`key-${et.type}`}
            className={`entity-folder key-folder ${et.type}`}
            onClick={() => { setActiveFolder(et.type); setIsCustomFolder(false); setIsKeyFolder(true); }}
          >
            <div className="folder-icon">⭐</div>
            <div className="folder-label">{et.keyLabel}</div>
            <div className="folder-count">{starredCounts[et.type]} cards</div>
          </div>
        ))}
        
        {/* Custom folders */}
        {(customFolders || []).map(folder => (
          <div 
            key={folder}
            className="entity-folder custom"
            onClick={() => { setActiveFolder(folder); setIsCustomFolder(true); setIsKeyFolder(false); }}
            style={{ opacity: customCounts[folder] === 0 ? 0.5 : 1 }}
          >
            <div className="folder-icon">📁</div>
            <div className="folder-label">{folder}</div>
            <div className="folder-count">{customCounts[folder]} cards</div>
          </div>
        ))}
      </div>
      <button className="add-entity-btn" onClick={handleAddClick} title="Add folder">+</button>
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
function EntityCard({ entity, chapters, onUpdatePosition, onEdit, onDelete, onToggleStar, isSelected, onShiftClick }) {
  const cardRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.classList.contains('entity-delete') || e.target.classList.contains('entity-star')) return;
    
    // Shift+click for merge selection
    if (e.shiftKey && onShiftClick) {
      e.preventDefault();
      onShiftClick();
      return;
    }
    
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

  // For collections, show story titles instead of chapter numbers
  const displayRefs = entity.storyRefs && entity.storyRefs.length > 0
    ? entity.storyRefs.join(', ')
    : chapterNames.length > 0 
      ? `Ch. ${chapterNames.join(', ')}`
      : null;

  return (
    <div
      ref={cardRef}
      className={`entity-card ${entity.type} ${isSelected ? 'selected-for-merge' : ''}`}
      style={{
        left: entity.position?.x || 0,
        top: entity.position?.y || 0,
        transform: `rotate(${(entity.id.charCodeAt(4) % 5) - 2}deg)`
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={onEdit}
    >
      <button className="entity-delete" onClick={onDelete} title="Delete card">×</button>
      {onToggleStar && (
        <button 
          className={`entity-star ${entity.starred ? 'starred' : ''}`} 
          onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
          title={entity.starred ? "Unstar" : "Star as key"}
        >
          {entity.starred ? '★' : '☆'}
        </button>
      )}
      {isSelected && <div className="merge-indicator">🔗</div>}
      <div className="entity-type">{entity.type}</div>
      <div className="entity-name">{entity.name}</div>
      {entity.description && (
        <div className="entity-description">{entity.description}</div>
      )}
      {displayRefs && (
        <div className="entity-chapters">
          {displayRefs}
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
// Drive Modal Component - List and load projects from Google Drive
function DriveModal({ projects, onLoad, onRefresh, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h2>Google Drive Projects</h2>
        <p style={{ marginBottom: '20px', color: 'var(--ink-light)' }}>
          Projects stored in your Google Drive "Bookboard" folder.
        </p>
        
        {projects.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 20px' }}>
            <p>No projects found on Google Drive.</p>
            <p className="help-text">Use "Sync All" to upload your local projects.</p>
          </div>
        ) : (
          <div className="drive-project-list">
            {projects.map(file => (
              <div key={file.id} className="drive-project-item">
                <div className="drive-project-info">
                  <span className="drive-project-name">{file.name.replace('.json', '')}</span>
                  <span className="drive-project-date">
                    Modified: {new Date(file.modifiedTime).toLocaleString()}
                  </span>
                </div>
                <button 
                  className="btn btn-small"
                  onClick={() => onLoad(file.id, file.name)}
                >
                  Load
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onRefresh}>Refresh</button>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// Settings Modal Component
function SettingsModal({ geminiKey, onGeminiKeyChange, googleClientId, onGoogleClientIdChange, googleAuthStatus, onGoogleSignIn, debugMode, onDebugModeChange, onClose }) {
  const [showKey, setShowKey] = useState(false);
  const [showClientId, setShowClientId] = useState(false);
  
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
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <span className="version-badge">v{APP_VERSION}</span>
        </div>
        
        <div className="settings-section">
          <h3>Google Drive Sync</h3>
          <p className="help-text" style={{ marginBottom: '12px' }}>
            Sync your projects across devices using Google Drive. Your API keys stay local and are never synced.
          </p>
          
          <div style={{ position: 'relative' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: '500' }}>Google OAuth Client ID</label>
            <input
              type={showClientId ? 'text' : 'password'}
              value={googleClientId}
              onChange={(e) => onGoogleClientIdChange(e.target.value)}
              placeholder="xxxxx.apps.googleusercontent.com"
              style={{ fontFamily: "'JetBrains Mono', monospace", paddingRight: '60px', fontSize: '0.8rem' }}
            />
            <button 
              type="button"
              className="btn-show-hide"
              onClick={() => setShowClientId(!showClientId)}
            >
              {showClientId ? 'Hide' : 'Show'}
            </button>
          </div>
          
          {googleClientId && (
            <div style={{ marginTop: '12px' }}>
              {googleAuthStatus === 'signed_in' ? (
                <p style={{ color: 'var(--green-pin)' }}>✓ Signed in to Google</p>
              ) : (
                <button className="btn" onClick={onGoogleSignIn}>Sign in to Google</button>
              )}
            </div>
          )}
          
          <details className="api-key-help" style={{ marginTop: '16px' }}>
            <summary style={{ cursor: 'pointer', fontWeight: '500' }}>How to set up Google Drive sync</summary>
            <ol>
              <li>Go to <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
              <li>Select your project (or create one)</li>
              <li>Enable <strong>Google Drive API</strong> (APIs & Services → Enable APIs)</li>
              <li>Go to <strong>Credentials</strong> → <strong>Create Credentials</strong> → <strong>OAuth client ID</strong></li>
              <li>Choose <strong>Web application</strong></li>
              <li>Add your URL to <strong>Authorized JavaScript origins</strong>:
                <ul>
                  <li><code>http://localhost:8000</code> (for local dev)</li>
                  <li>Your GitHub Pages URL (if hosted there)</li>
                </ul>
              </li>
              <li>Copy the <strong>Client ID</strong> and paste it above</li>
              <li>Set up the OAuth consent screen (can be in "Testing" mode for personal use)</li>
            </ol>
          </details>
        </div>

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
          
          <details className="api-key-help">
            <summary style={{ cursor: 'pointer', fontWeight: '500' }}>How to get your Gemini API key</summary>
            <ol>
              <li>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">aistudio.google.com/apikey</a></li>
              <li>Sign in with your Google account</li>
              <li>Click <strong>"Create API key"</strong></li>
              <li>Choose a project (or create one) and click <strong>"Create"</strong></li>
              <li>Copy the key and paste it above</li>
            </ol>
            <p className="help-text" style={{ marginTop: '12px' }}>
              The free tier includes 15 requests/minute. Your key is stored only in your browser.
            </p>
          </details>
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
  const [bookType, setBookType] = useState('novel');
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Extract Entities</h2>
        <p style={{ marginBottom: '20px', color: 'var(--ink-light)' }}>
          Use Gemini AI to automatically extract characters, themes, locations, and key scenes from your manuscript.
        </p>
        
        <div className="book-type-section">
          <label>Book Type</label>
          <select value={bookType} onChange={(e) => setBookType(e.target.value)}>
            <option value="novel">Novel (single continuous story)</option>
            <option value="collection">Short Story Collection</option>
          </select>
          <p className="help-text" style={{ marginTop: '8px' }}>
            {bookType === 'novel' 
              ? 'Characters appearing in multiple chapters will be merged into one card.'
              : 'Each story is treated independently. Characters with the same name in different stories remain separate.'}
          </p>
        </div>
        
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
            onClick={() => onExtract(bookType === 'collection')}
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
function EntityModal({ entity, chapters, customFolders = [], defaultType, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    if (entity) {
      return entity;
    }
    return {
      type: defaultType || 'character',
      name: '',
      description: '',
      chapterRefs: [],
      folder: null
    };
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
        <h2>{entity?.id ? 'Edit Card' : 'Add Card'}</h2>
        
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

          {customFolders.length > 0 && (
            <>
              <label>Custom Folder</label>
              <select
                value={form.folder || ''}
                onChange={(e) => setForm({ ...form, folder: e.target.value || null })}
              >
                <option value="">None</option>
                {customFolders.map(folder => (
                  <option key={folder} value={folder}>{folder}</option>
                ))}
              </select>
              <p className="help-text">Optionally group this card in a custom folder</p>
            </>
          )}

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

// Merge Modal Component
function MergeModal({ entities, onMerge, onClose }) {
  const [keepId, setKeepId] = useState(entities[0]?.id || '');
  
  if (entities.length < 2) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <h2>Merge Cards</h2>
          <p>Select at least 2 cards of the same type to merge.</p>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>OK</button>
          </div>
        </div>
      </div>
    );
  }
  
  const keepEntity = entities.find(e => e.id === keepId);
  const mergeEntity = entities.find(e => e.id !== keepId);
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Merge Cards</h2>
        <p style={{ marginBottom: '16px', color: 'var(--ink-light)' }}>
          Combine two cards into one. The merged card will have combined descriptions and chapter references.
        </p>
        
        <label>Keep this card (primary):</label>
        <select value={keepId} onChange={(e) => setKeepId(e.target.value)}>
          {entities.map(e => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
        
        <div className="merge-preview">
          <p><strong>Result:</strong></p>
          <p><strong>Name:</strong> {keepEntity?.name}</p>
          <p><strong>Description:</strong> {[keepEntity?.description, mergeEntity?.description].filter(Boolean).join(' | ') || '(none)'}</p>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button 
            className="btn btn-primary" 
            onClick={() => onMerge(keepEntity, mergeEntity)}
          >
            Merge
          </button>
        </div>
      </div>
    </div>
  );
}

// Add Folder Modal Component
function AddFolderModal({ existingFolders = [], onAdd, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  
  // Reserved folder names (Key folders)
  const reservedNames = [
    'key scenes', 'key characters', 'key locations', 'key themes', 'key ideas'
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a folder name');
      return;
    }
    if (existingFolders.map(f => f.toLowerCase()).includes(trimmed.toLowerCase())) {
      setError('A folder with this name already exists');
      return;
    }
    if (reservedNames.includes(trimmed.toLowerCase())) {
      setError('This name is reserved for Key folders');
      return;
    }
    onAdd(trimmed);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Add Custom Folder</h2>
        <p className="help-text" style={{ marginBottom: '16px' }}>
          Create a custom folder to group cards across types (e.g., "Antagonists", "Act 1", "Red Herrings").
        </p>
        
        <form onSubmit={handleSubmit}>
          <label>Folder Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(''); }}
            placeholder="e.g., Antagonists"
            autoFocus
          />
          {error && <p style={{ color: 'var(--red-pin)', fontSize: '0.8rem', marginTop: '-8px' }}>{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add Folder</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Render the app
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
