# Legacy Systems Inventory

This repo is now centered on three primary surfaces:

- Calendar / Dashboard
- Week
- Notes

The systems below are still present for compatibility, export, or migration work.

## Legacy Notes Stack

Legacy tables and code paths:

- `notes_documents`
- `note_blocks`
- `task_attachments.note_document_id`
- `/api/notes/documents/*`
- `/one-time`

Current replacement:

- `notes`
- `note_categories`
- `note_attachments`
- `/api/notes`
- `/notes`

Known live code paths still using the legacy stack:

- [`src/lib/server/planner/legacy.ts`](/Users/mbtkimya/Documents/taskpad%20svelte%20v2/src/lib/server/planner/legacy.ts)
  - `getNotesViewData`
  - `getOneTimeViewData`
  - `saveNoteBlocks`
  - legacy search/document workspace helpers
- [`src/routes/api/notes/documents/+server.ts`](/Users/mbtkimya/Documents/taskpad%20svelte%20v2/src/routes/api/notes/documents/+server.ts)
- [`src/routes/api/notes/documents/[documentId]/+server.ts`](</Users/mbtkimya/Documents/taskpad svelte v2/src/routes/api/notes/documents/[documentId]/+server.ts>)
- [`src/routes/api/notes/documents/[documentId]/attachments/+server.ts`](</Users/mbtkimya/Documents/taskpad svelte v2/src/routes/api/notes/documents/[documentId]/attachments/+server.ts>)
- [`src/routes/api/notes/documents/[documentId]/attachments/[attachmentId]/+server.ts`](</Users/mbtkimya/Documents/taskpad svelte v2/src/routes/api/notes/documents/[documentId]/attachments/[attachmentId]/+server.ts>)
- [`src/routes/api/notes/documents/[documentId]/duplicate/+server.ts`](</Users/mbtkimya/Documents/taskpad svelte v2/src/routes/api/notes/documents/[documentId]/duplicate/+server.ts>)
- [`src/routes/api/notes/documents/[documentId]/workspace/+server.ts`](</Users/mbtkimya/Documents/taskpad svelte v2/src/routes/api/notes/documents/[documentId]/workspace/+server.ts>)
- [`src/routes/one-time/+page.server.ts`](/Users/mbtkimya/Documents/taskpad%20svelte%20v2/src/routes/one-time/+page.server.ts)
- [`src/routes/one-time/+page.svelte`](/Users/mbtkimya/Documents/taskpad%20svelte%20v2/src/routes/one-time/+page.svelte)

## Migration Direction

1. Export legacy `notes_documents` and `note_blocks`.
2. Convert note-like documents into Notes v2 `notes`.
3. Convert `/one-time` documents into Notes v2 checklist notes.
4. Move legacy note attachments from `task_attachments.note_document_id` into `note_attachments`.
5. Only after data migration/export is proven, deprecate:
   - `/one-time`
   - `/api/notes/documents/*`
   - `notes_documents`
   - `note_blocks`
   - `task_attachments.note_document_id`

## Near-Term TODO

- Add an executable migration/export script from legacy notes to Notes v2.
- Add a checklist note UI mode in `/notes`.
- Replace `/one-time` links with `/notes` once checklist notes cover the workflow.
- Stop routing command palette note results to `/one-time`.
