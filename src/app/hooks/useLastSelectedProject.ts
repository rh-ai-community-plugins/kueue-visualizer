import { useState, useCallback, useEffect } from 'react';

// Copied from hello-world reference plugin.
// Uses key 'rhoai.last-selected-project' — shared across community plugins via localStorage.
// StorageEvent listener syncs state across tabs.
//
// NOTE: The main RHOAI dashboard (odh-dashboard) uses a different internal key:
//   'mod-arch.namespace.lastUsed' (see frontend/src/concepts/projects/getStoredPreferredProject.ts)
// These two keys are NOT shared. If you want true cross-RHOAI sync (i.e. selecting a project
// in the main RHOAI nav propagates here), read from 'mod-arch.namespace.lastUsed' as a fallback:
//   const raw = localStorage.getItem('rhoai.last-selected-project')
//            ?? localStorage.getItem('mod-arch.namespace.lastUsed');
// This is fragile (internal key), so we deliberately don't do it by default.

const STORAGE_KEY = 'rhoai.last-selected-project';

function readLastProject(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writeLastProject(project: string | null): void {
  if (project === null) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, project);
  }
}

export function useLastSelectedProject(): [string | null, (project: string | null) => void] {
  const [selected, setSelected] = useState<string | null>(readLastProject);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setSelected(readLastProject());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const select = useCallback((project: string | null) => {
    writeLastProject(project);
    setSelected(project);
  }, []);

  return [selected, select];
}
