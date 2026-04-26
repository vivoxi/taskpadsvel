import { describe, expect, it } from 'vitest';
import { notesValidationJsonResponse } from '../src/lib/server/notes-v2-errors';
import {
  NotesValidationError,
  buildNoteUploadPath,
  buildPlainText,
  createNoteBlock,
  validateCategoryInput,
  validateCreateNoteInput,
  validateAttachmentFile,
  validateNoteBlocks,
  validateUpdateNoteInput
} from '../src/lib/notes-v2/validation';
import { resolveNoteUploadAbsolutePath } from '../src/lib/server/notes-v2-files';

describe('notes v2 validation', () => {
  it('accepts valid note blocks', () => {
    expect(
      validateNoteBlocks([
        { id: '1', type: 'heading', text: 'Title' },
        { id: '2', type: 'paragraph', text: 'Body' },
        { id: '3', type: 'checklist', text: 'Done', checked: true },
        { id: '4', type: 'bullet', text: 'Item' },
        { id: '5', type: 'divider' }
      ])
    ).toEqual([
      { id: '1', type: 'heading', text: 'Title' },
      { id: '2', type: 'paragraph', text: 'Body' },
      { id: '3', type: 'checklist', text: 'Done', checked: true },
      { id: '4', type: 'bullet', text: 'Item' },
      { id: '5', type: 'divider' }
    ]);
  });

  it('rejects unknown block types', () => {
    expect(() => validateNoteBlocks([{ id: 'x', type: 'quote', text: 'Nope' }])).toThrow(NotesValidationError);
  });

  it('builds plain text from title and blocks', () => {
    expect(
      buildPlainText('Meeting', [
        { id: 'a', type: 'heading', text: 'Agenda' },
        { id: 'b', type: 'paragraph', text: 'Budget and timeline' },
        { id: 'c', type: 'divider' }
      ])
    ).toBe('Meeting\nAgenda\nBudget and timeline');
  });

  it('validates note create and update payloads', () => {
    const createInput = validateCreateNoteInput({
      title: 'Draft',
      category_id: null,
      content: [createNoteBlock('paragraph')]
    });
    const updateInput = validateUpdateNoteInput({
      title: 'Updated',
      is_starred: true,
      deleted_at: null
    });

    expect(createInput.title).toBe('Draft');
    expect(createInput.content).toHaveLength(1);
    expect(updateInput).toEqual({
      title: 'Updated',
      is_starred: true,
      deleted_at: null
    });
  });

  it('creates safe upload paths and rejects traversal', () => {
    const relativePath = buildNoteUploadPath(
      '123e4567-e89b-12d3-a456-426614174000',
      '../../report.pdf',
      'file-1'
    );

    expect(relativePath).toBe('notes/123e4567-e89b-12d3-a456-426614174000/file-1.pdf');
    expect(() => resolveNoteUploadAbsolutePath('../secret.txt')).toThrow(NotesValidationError);
  });

  it('rejects attachment file names that are too long', () => {
    const longName = `${'a'.repeat(181)}.pdf`;
    const file = new File(['hello'], longName, { type: 'application/pdf' });
    expect(() => validateAttachmentFile(file)).toThrow(NotesValidationError);
  });

  it('validates category input', () => {
    expect(validateCategoryInput({ name: 'Inbox', color: '#6366f1', sort_order: 2 })).toEqual({
      name: 'Inbox',
      color: '#6366f1',
      sort_order: 2
    });
  });

  it('maps NotesValidationError to a 400 json response', async () => {
    const response = notesValidationJsonResponse(new NotesValidationError('Bad content'));

    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({ error: 'Bad content' });
  });
});
