-- ── Note categories ───────────────────────────────────────────────────────
CREATE TABLE public.note_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  parent_id   uuid REFERENCES public.note_categories(id) ON DELETE SET NULL,
  color       text,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.note_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deny all note_categories" ON public.note_categories FOR ALL USING (false);

CREATE INDEX note_categories_parent_idx ON public.note_categories (parent_id);
CREATE INDEX note_categories_sort_idx   ON public.note_categories (sort_order);

-- ── Link documents to categories ──────────────────────────────────────────
ALTER TABLE public.notes_documents
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.note_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS notes_documents_category_idx ON public.notes_documents (category_id);

-- ── Extend note_blocks to support image blocks ────────────────────────────
ALTER TABLE public.note_blocks DROP CONSTRAINT IF EXISTS note_blocks_type_check;
ALTER TABLE public.note_blocks
  ADD CONSTRAINT note_blocks_type_check
  CHECK (type IN ('heading', 'paragraph', 'checklist', 'divider', 'image'));
