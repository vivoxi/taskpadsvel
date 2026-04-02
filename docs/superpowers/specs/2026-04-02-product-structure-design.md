# Taskpad Svelte — Ürün Yapısı Tasarımı

**Tarih:** 2026-04-02  
**Konu:** Template/operation katman ayrımı, weekly period instance persistence, archive düzeltmesi

---

## 1. Genel Mimari

Sistem iki katmana ayrılır:

```
TEMPLATE LAYER          OPERATION LAYER
──────────────          ───────────────
/weekly                 /thisweek
/monthly        ──►     /thismonth
                        /random
                        (dashboard)
```

- **Template katmanı** (`/weekly`, `/monthly`): Recurring iş şablonlarını yönetir. CRUD ve metadata (estimated hours, preferred day, preferred week). Completion state yok, dönem reset'i yok.
- **Operation katmanı** (`/thisweek`, `/thismonth`, `/random`): Gerçek dönem takibi. Period instance'lar, schedule block'lar, completion toggle, archive.
- `/random` doğrudan operation — template/instance ayrımı yok, task'ler kendisi operasyonel.

---

## 2. Data Model

Supabase tabloları değişmiyor. `user_preferences` key'leri:

| Key | Yazan | Okuyan |
|-----|-------|--------|
| `period_instances:weekly:{weekKey}` | `/api/schedule/generate` (**yeni**) | `snapshot.ts` |
| `period_instances:monthly:{monthKey}` | `/thismonth` sayfası | `snapshot.ts` |
| `period_instance_status:weekly:{weekKey}` | `ScheduleBlockCard.syncInstanceCompletion` | `snapshot.ts`, `thisweek` |
| `period_instance_status:monthly:{monthKey}` | `thismonth.toggleInstance` | `snapshot.ts`, `thismonth` |
| `task-order:{type}` | `TaskList` | `TaskList` |

### Schedule block metadata (değişmiyor)

`weekly_schedule.notes` alanındaki `__TASKPAD_SCHEDULE__` prefix'li JSON:

```json
{
  "completed": boolean,
  "linkedTaskId": string | null,
  "linkedTaskType": "weekly" | "monthly" | null,
  "linkedInstanceKey": string | null
}
```

---

## 3. Sayfa ve Bileşen Değişiklikleri

### `/weekly` ve `/monthly` — template sayfaları

**Değişiklik:** `TaskList` bileşeninde `templateMode={true}` iken `checkAndReset()` çağrılmaz.

Mevcut `checkAndReset` çağrısı:
```ts
$effect(() => {
  if (type === 'random' || resetChecked) return;
  // ...
  checkAndReset();
});
```

Olması gereken:
```ts
$effect(() => {
  if (type === 'random' || templateMode || resetChecked) return;
  // ...
  checkAndReset();
});
```

Görsel değişiklik yok — completion toggle zaten kapalı, bu sadece gereksiz DB çağrısını kaldırır.

### `/thisweek` — değişen yok

Mevcut yapı spec'e uygun:
- Sol kolon: Daily Planner notes (editable)
- Sağ kolon: Schedule blocks (drag-drop, day move, attachment, add/delete)
- Gün başlıklarında tarih mevcut (`getDayDateLabel`)
- Generate butonu yok
- "Generate from This Month" linki var
- Archive: past week → `history_snapshots` snapshot'ından okur

### `/thismonth` — değişen yok

Mevcut yapı spec'e uygun:
- Month grid (4 hafta × 5 gün), tarih etiketli
- Flexible monthly tasks bölümü
- Drag-drop: instance'ları hücreler ve flexible alan arasında taşıma
- Completion toggle → This Week sync (`syncScheduleBlocksForInstance`)
- Generate Month butonu (rule-based only, AI yok)
- Archive: past month → `history_snapshots` snapshot'ından okur

### `/api/schedule/generate` — tek yeni davranış

Schedule block'lar insert edildikten sonra, o hafta için weekly template'lerden oluşturulan `PersistedPeriodTaskInstance[]` listesi `period_instances:weekly:{weekKey}` olarak `user_preferences`'a upsert edilir.

```ts
// Mevcut: block'ları insert et
// Yeni: ayrıca weekly instances'ı yaz
// Not: carryover hesabı için önceki hafta snapshot'ı gerekmez —
// weekly için carryover özelliği kullanılmaz, sadece materialize edilir.
const weeklyInstances = materializeWeeklyTaskInstances(weeklyTasks, weekKey).map(instance => ({
  ...instance,
  carryover: false,
  carryover_source_period_key: null
}));

await supabase.from('user_preferences').upsert({
  key: getWeeklyInstancesStorageKey(weekKey),
  value: {
    instances: weeklyInstances,
    updatedAt: new Date().toISOString()
  },
  updated_at: new Date().toISOString()
}, { onConflict: 'key' });
```

### `/random` — değişen yok

Operation sayfası, `task.completed` üzerinden çalışır.

---

## 4. Completion Sync

### This Week → This Month

`ScheduleBlockCard.syncInstanceCompletion()` — zaten çalışıyor:
1. Block toggle edildiğinde `linkedInstanceKey` okunur
2. Aynı instance'a bağlı tüm block'lar kontrol edilir
3. Hepsi tamamlandıysa `period_instance_status:{type}:{periodKey}` güncellenir
4. TanStack Query cache güncellenir → This Month sayfası reaktif olarak yenilenir

### This Month → This Week

`thismonth.syncScheduleBlocksForInstance()` — zaten çalışıyor:
1. Instance toggle edildiğinde o aya ait tüm `weekly_schedule` block'ları sorgulanır
2. `linkedInstanceKey` eşleşen block'ların `notes.completed` güncellenir
3. TanStack Query cache invalidate edilir → This Week reaktif yenilenir

**Template sayfalarında sync yok:** `templateMode=true` → completion toggle kapalı → sync tetiklenmez.

---

## 5. Archive ve Snapshot

### Weekly snapshot (şu an kısmen bozuk → düzelecek)

`takeSnapshot('weekly', weekKey)` akışı, generate çalıştırıldıktan sonra:

1. `period_instances:weekly:{weekKey}` → instance listesi okunur (**artık var**)
2. `period_instance_status:weekly:{weekKey}` → hangi instance'lar tamamlandı
3. `completedTasks` / `missedTasks` instance-based hesaplanır
4. `weekly_schedule` block'ları → `completedScheduleBlocks` / `missedScheduleBlocks`
5. `weekly_plan` → `plannerNotes`
6. `history_snapshots` upsert

Generate çalıştırılmadan snapshot alınırsa: instance listesi yok → eski fallback (`task.completed`) devreye girer. Bu kabul edilebilir edge case.

### Monthly snapshot (zaten çalışıyor)

`period_instances:monthly:{monthKey}` This Month sayfası tarafından yazılır. Snapshot aynı mantıkla okur.

---

## 6. Kapsam Dışı

- AI schedule generation: değişen yok
- Dashboard metrik kartları: değişen yok
- Notes ve Pomodoro sayfaları: değişen yok
- Attachment mekanizması: değişen yok
- DB migration: gerekmiyor (tablo şeması değişmiyor)
- `/random` template ayrımı: yok, olduğu gibi

---

## 7. Değişiklik Özeti

| Dosya | Değişiklik |
|-------|-----------|
| `src/lib/components/TaskList.svelte` | `checkAndReset` → `templateMode` koşuluna bağla |
| `src/routes/api/schedule/generate/+server.ts` | Block insert sonrası `period_instances:weekly:{weekKey}` upsert ekle |

Tüm diğer dosyalar spec'e zaten uygun, değiştirilmez.
