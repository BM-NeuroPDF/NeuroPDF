import type { Language } from '@/utils/translations';

export const STORAGE_KEY = 'activePdfBase64';

export type Message = {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  i18nKey?: string;
  i18nParams?: Record<string, string>;
  sourceLanguage?: Language;
  translations?: Partial<Record<Language, string>>;
};

export type PdfCoreState = {
  list: File[];
  active: File | null;
};

export type PdfAction =
  | { type: 'ADD_PDFS'; files: File[] }
  | { type: 'REMOVE'; fileName: string }
  | { type: 'SET_ACTIVE'; fileName: string }
  | { type: 'SAVE_PDF'; file: File | null }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; file: File };

function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
}

export function pdfReducer(state: PdfCoreState, action: PdfAction): PdfCoreState {
  switch (action.type) {
    case 'ADD_PDFS': {
      const candidates = action.files.filter(isPdfFile);
      const names = new Set(state.list.map((f) => f.name));
      const toAdd: File[] = [];
      for (const f of candidates) {
        if (!names.has(f.name)) {
          toAdd.push(f);
          names.add(f.name);
        }
      }
      const list = [...state.list, ...toAdd];
      const active = state.active ?? list[0] ?? null;
      return { list, active };
    }
    case 'REMOVE': {
      const list = state.list.filter((f) => f.name !== action.fileName);
      const active = state.active?.name === action.fileName ? (list[0] ?? null) : state.active;
      return { list, active };
    }
    case 'SET_ACTIVE': {
      const f = state.list.find((x) => x.name === action.fileName);
      if (!f) return state;
      return { ...state, active: f };
    }
    case 'SAVE_PDF': {
      if (!action.file) {
        return { list: [], active: null };
      }
      if (typeof action.file.slice !== 'function') {
        return state;
      }
      const file = action.file;
      const idx = state.list.findIndex((f) => f.name === file.name);
      const list =
        idx >= 0 ? state.list.map((f, i) => (i === idx ? file : f)) : [...state.list, file];
      return { list, active: file };
    }
    case 'CLEAR':
      return { list: [], active: null };
    case 'HYDRATE':
      return { list: [action.file], active: action.file };
    default:
      return state;
  }
}
