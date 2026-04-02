# Taskpad Svelte

Kisa repo notu. Uzun tutulmadi.

## Stack
- SvelteKit 2
- Svelte 5
- Tailwind 4
- Supabase

## Ana Sayfalar
- `/dashboard`: weekly/monthly/random/schedule yuzdeleri
- `/weekly`: recurring weekly tasks (template katman, templateMode=true)
- `/monthly`: recurring monthly tasks (template katman, templateMode=true)
- `/random`: kategorili serbest task board
- `/thisweek`: planner + haftalik schedule + gecmis hafta arsivi
- `/thismonth`: monthly task grid (4hf x 5gun) + generate month + drag-drop + gecmis ay arsivi

## Onemli Davranislar
- Weekly taskler yeni haftada reset olur
- Monthly taskler yeni ayda reset olur
- Reset oncesi snapshot alinir
- Gecmis weekly/monthly arsiv gorunumu var
- Gecmis weekly arsivde attachment ve schedule block durumu da gorunur
- Template katman (`/weekly`, `/monthly`): `templateMode=true` → `checkAndReset` calismaz
- `/thismonth` monthly instance checkbox -> ayni instance'a bagli `/thisweek` block'lariyla 2-way sync
- `/weekly` ve `/monthly` template sayfalarinda completion/progress yok

## Schedule
- `Generate`: AI'siz rules scheduler
- Generate sadece `/thismonth` icinden calisir, `/thisweek` generate etmez
- Calisma saatleri: `10:00-17:00`
- Mola: `13:00-14:00`
- Random taskler schedule'a girmez
- Schedule block checkbox ile weekly/monthly task completion senkron
- Generate sonrasi `period_instances:weekly:{weekKey}` `user_preferences`'a upsert edilir

## Task Metadata
- `Hours Needed`
- Weekly icin `Preferred Day`
- Monthly icin `Preferred Week` + `Preferred Day`
- Random icin `Category`
- Bu bilgiler `tasks.notes` icinde metadata olarak tutuluyor

## Random Board
- Kategori ekleme / silme / yeniden adlandirma
- Kategori siralama
- Task siralama
- Her kategori altinda Notion benzeri `Enter` ile task ekleme

## Attachments
- Weekly/monthly/random tasklerde attachment var
- Schedule block ile bagli task attachment'lari senkron
- Refresh sonrasi korunur
- Gecmis hafta arsivinde de gorunur

## Theme / UI
- Light mode / dark mode toggle var
- Mobil drawer navigation var
- Weekly / monthly / random sayfa iskeletleri benzerlestirildi

## API
- Task mutation (toggle, title, notes) `PATCH /api/task/[taskId]` uzerinden gider, dogrudan Supabase degil
- Auth header: `Authorization: Bearer ${password}`

## User Preferences (Supabase)
- Task sirasi ve random kategori sirasi `user_preferences` tablosunda tutuluyor (key/value jsonb)
- localStorage hala cache olarak kullaniliyor (anlik fallback), Supabase asil kaynak
- Repo icinde migration yok; fresh ortamda `user_preferences` tablosu manuel olusturulmali ya da ayri migration eklenmeli

## Schedule Bloklari
- Manuel block ekleme: her gun altinda "+ Add block" formu var
- Manuel block silme: hover'da Trash2 ikonu gorunur
- Dashboard metric kartlari tiklanabilir link (`<a>` tag, ilgili sayfaya gider)

## Not
- `npm run check`
- `npm test`
ikisi temiz olmali.
