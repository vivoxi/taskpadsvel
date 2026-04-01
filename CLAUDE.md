# Taskpad Svelte

Kisa repo notu. Uzun tutulmadi.

## Stack
- SvelteKit 2
- Svelte 5
- Tailwind 4
- Supabase

## Ana Sayfalar
- `/dashboard`: weekly/monthly/random/schedule yuzdeleri
- `/weekly`: recurring weekly tasks
- `/monthly`: recurring monthly tasks + gecmis ay arsivi
- `/random`: kategorili serbest task board
- `/thisweek`: planner + AI/rule based weekly schedule + gecmis hafta arsivi

## Onemli Davranislar
- Weekly taskler yeni haftada reset olur
- Monthly taskler yeni ayda reset olur
- Reset oncesi snapshot alinir
- Gecmis weekly/monthly arsiv gorunumu var
- Gecmis weekly arsivde attachment ve schedule block durumu da gorunur

## Schedule
- `Generate`: AI'siz rules scheduler
- `Generate with AI`: provider bazli AI scheduler
- Calisma saatleri: `10:00-17:00`
- Mola: `13:00-14:00`
- Random taskler schedule'a girmez
- Schedule block checkbox ile weekly/monthly task completion senkron
- Ters yon de var: weekly/monthly task checkbox schedule blocklari gunceller

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

## AI
- `AI_PROVIDER=anthropic`
- `AI_PROVIDER=openai-compatible`
- Runtime env uzerinden okunur

## Not
- `npm run check`
- `npm test`
ikisi temiz olmali.
