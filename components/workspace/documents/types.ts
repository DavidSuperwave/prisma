export type DocumentKind = "spreadsheet" | "pdf" | "image" | "text" | "markdown" | "other";

export type DocumentPreviewSheet = {
  name: string;
  headers: string[];
  sampleRows: Array<Record<string, unknown>>;
  rowCount: number;
};

export type DocumentPreview = {
  kind: DocumentKind;
  sheets?: DocumentPreviewSheet[];
  pageCount?: number;
  textLength?: number;
  excerpt?: string;
  truncated?: boolean;
  ocrUsed?: boolean;
  ocrError?: string | null;
  extractedAt?: string;
};

export type DocumentItem = {
  id: string;
  fileName: string;
  publicUrl: string;
  storagePath: string;
  mimeType: string;
  sizeBytes: number | null;
  fileKind: DocumentKind;
  preview: DocumentPreview | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  fileCount: number;
};
