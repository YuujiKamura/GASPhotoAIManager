/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly BASE_URL: string;
  readonly SSR: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Allow JSON imports
declare module '*.json' {
  const value: unknown;
  export default value;
}

// File System Access API types
interface FileSystemDirectoryHandle {
  name: string;
  kind: 'directory';
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void>;
  resolve(possibleDescendant: FileSystemHandle): Promise<string[] | null>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  keys(): AsyncIterableIterator<string>;
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface FileSystemFileHandle {
  name: string;
  kind: 'file';
  getFile(): Promise<File>;
  createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream extends WritableStream {
  write(data: BufferSource | Blob | string): Promise<void>;
  seek(position: number): Promise<void>;
  truncate(size: number): Promise<void>;
}

type FileSystemHandle = FileSystemFileHandle | FileSystemDirectoryHandle;

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface Window {
  showDirectoryPicker(options?: DirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker(options?: { multiple?: boolean; types?: Array<{ description?: string; accept: Record<string, string[]> }> }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker(options?: { suggestedName?: string; types?: Array<{ description?: string; accept: Record<string, string[]> }> }): Promise<FileSystemFileHandle>;
}

// Allow importing non-existent generated files (they're created at build time)
declare module '../src/generated/codebase-stats.json' {
  const value: {
    generatedAt: string;
    health: Array<{
      name: string;
      status: 'ok' | 'warning' | 'error';
      count: number;
      details: string[];
    }>;
    tasks: Array<{
      id: string;
      title: string;
      description: string;
      priority: 'high' | 'medium' | 'low';
      status: 'todo' | 'done';
      file?: string;
      estimatedLines?: number;
    }>;
  };
  export default value;
}
