import { describe, it, expect } from 'vitest';
import { pdfReducer } from '../PdfContext';

function f(name: string, type = 'application/pdf') {
  return new File(['x'], name, { type });
}

describe('pdfReducer', () => {
  const initial = { list: [] as File[], active: null as File | null };

  it('ADD_PDFS ignores non-pdf files', () => {
    const next = pdfReducer(initial, {
      type: 'ADD_PDFS',
      files: [f('x.txt', 'text/plain')],
    });
    expect(next.list).toEqual([]);
  });

  it('SAVE_PDF with null clears list', () => {
    const withPdf = pdfReducer(initial, {
      type: 'ADD_PDFS',
      files: [f('a.pdf')],
    });
    const cleared = pdfReducer(withPdf, { type: 'SAVE_PDF', file: null });
    expect(cleared.list).toEqual([]);
    expect(cleared.active).toBeNull();
  });

  it('SAVE_PDF returns state when file has no slice', () => {
    const withPdf = pdfReducer(initial, {
      type: 'ADD_PDFS',
      files: [f('a.pdf')],
    });
    const bad = { name: 'a.pdf' } as File;
    const same = pdfReducer(withPdf, { type: 'SAVE_PDF', file: bad });
    expect(same).toBe(withPdf);
  });

  it('handles unknown action type', () => {
    const next = pdfReducer(initial, {
      type: 'UNKNOWN',
    } as unknown as Parameters<typeof pdfReducer>[1]);
    expect(next).toBe(initial);
  });

  it('REMOVE reassigns active when removing current file', () => {
    const a = f('a.pdf');
    const b = f('b.pdf');
    let state = pdfReducer(initial, { type: 'ADD_PDFS', files: [a, b] });
    state = pdfReducer(state, { type: 'SET_ACTIVE', fileName: 'a.pdf' });
    state = pdfReducer(state, { type: 'REMOVE', fileName: 'a.pdf' });
    expect(state.active?.name).toBe('b.pdf');
    state = pdfReducer(state, { type: 'REMOVE', fileName: 'b.pdf' });
    expect(state.active).toBeNull();
  });

  it('SET_ACTIVE returns unchanged state when filename not in list', () => {
    const a = f('a.pdf');
    const state = pdfReducer(initial, { type: 'ADD_PDFS', files: [a] });
    const same = pdfReducer(state, {
      type: 'SET_ACTIVE',
      fileName: 'missing.pdf',
    });
    expect(same).toBe(state);
  });

  it('SAVE_PDF replaces existing file with same name', () => {
    const a1 = f('a.pdf');
    const a2 = new File(['zz'], 'a.pdf', { type: 'application/pdf' });
    let state = pdfReducer(initial, { type: 'ADD_PDFS', files: [a1] });
    state = pdfReducer(state, { type: 'SAVE_PDF', file: a2 });
    expect(state.list.length).toBe(1);
    expect(state.active).toBe(a2);
  });

  it('SAVE_PDF replaces duplicate name while keeping other files in list', () => {
    const a = f('a.pdf');
    const b = f('b.pdf');
    const aNew = new File(['zz'], 'a.pdf', { type: 'application/pdf' });
    let state = pdfReducer(initial, { type: 'ADD_PDFS', files: [a, b] });
    state = pdfReducer(state, { type: 'SAVE_PDF', file: aNew });
    expect(state.list.map((x) => x.name)).toEqual(['a.pdf', 'b.pdf']);
    expect(state.list[0]).toBe(aNew);
    expect(state.list[1]).toBe(b);
  });

  it('REMOVE keeps active when removing a different file', () => {
    const a = f('a.pdf');
    const b = f('b.pdf');
    const c = f('c.pdf');
    let state = pdfReducer(initial, { type: 'ADD_PDFS', files: [a, b, c] });
    state = pdfReducer(state, { type: 'SET_ACTIVE', fileName: 'b.pdf' });
    state = pdfReducer(state, { type: 'REMOVE', fileName: 'c.pdf' });
    expect(state.active?.name).toBe('b.pdf');
  });
});
