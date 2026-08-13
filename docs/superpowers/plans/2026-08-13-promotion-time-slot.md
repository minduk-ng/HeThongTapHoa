# Khung giờ vàng (Lịch thứ/giờ) + Hiệu suất batch code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép mỗi campaign promotion cấu hình nhiều khung giờ vàng (thứ trong tuần + giờ bắt đầu/kết thúc) mà engine chỉ áp dụng khi thời điểm hiện tại nằm trong ≥1 slot; đồng thời hiển thị Hiệu suất campaign batch theo % mã đã dùng.

**Architecture:** Bảng mới `promotion_time_slots` (promotion_id, day_of_week, start_time, end_time) liên kết hasMany với Promotion. `PromotionEngine::matchesConditions` thêm check thời điểm nằm trong slot (AND với conditions khác; campaign không slot thì không ràng buộc). Form thêm section "Khung giờ vàng" (checkbox T2–CN + input time). Cột Hiệu suất trong PromotionsManager ưu tiên `codes_used / codes_count` cho batch.

**Tech Stack:** Laravel 12 (PHP 8.3), MySQL/SQLite test, Inertia + React 19 + TypeScript, Pest.

## Global Constraints

- `day_of_week`: 0 = Chủ nhật, 1–6 = T2–T7 (Carbon `dayOfWeek`).
- So sánh giờ bằng chuỗi `'H:i'`; slot nửa mở `[start_time, end_time)`.
- Campaign có `timeSlots` rỗng → không ràng buộc giờ (backward compatible).
- Là điều kiện AND: phải thoả time_slots LẪN conditions khác.
- 4 chỗ eager load trong PromotionEngine phải thêm `timeSlots`: `with(['conditions', 'actions', 'timeSlots'])`.
- Validation: `time_slots.*.day_of_week` 0–6, `start_time`/`end_time` `date_format:H:i`, `end_time` `after:start_time`.
- Cột Hiệu suất batch: `codes_count > 0` → `codes_used / codes_count × 100` (cap 100), else `used_count / (target_usage ?? max_usage) × 100`.
- Spec: `docs/superpowers/specs/2026-08-13-promotion-time-slot-design.md`

---

### Task 1: Migration + Model PromotionTimeSlot + relation

**Files:**
- Create: `database/migrations/2026_08_13_000001_create_promotion_time_slots_table.php`
- Create: `app/Models/PromotionTimeSlot.php`
- Modify: `app/Models/Promotion.php` (relation `timeSlots()`)

**Interfaces:**
- Produces: model `PromotionTimeSlot` với `fillable = ['promotion_id','day_of_week','start_time','end_time']`, `casts = ['day_of_week' => 'int']`, `promotion()` belongsTo.
- Produces: `Promotion::timeSlots()` hasMany.

- [ ] **Step 1: Viết migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('promotion_time_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();
            $table->unsignedTinyInteger('day_of_week'); // 0=CN ... 6=T7
            $table->time('start_time');
            $table->time('end_time');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_time_slots');
    }
};
```

- [ ] **Step 2: Tạo model**

```php
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PromotionTimeSlot extends Model
{
    protected $fillable = ['promotion_id', 'day_of_week', 'start_time', 'end_time'];

    protected $casts = [
        'day_of_week' => 'int',
    ];

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
```

- [ ] **Step 3: Thêm relation vào Promotion model**

```php
public function timeSlots(): \Illuminate\Database\Eloquent\Relations\HasMany
{
    return $this->hasMany(PromotionTimeSlot::class);
}
```

- [ ] **Step 4: Chạy migration + test**

Run: `php artisan migrate`
Run: `php artisan test --filter='MigrationRebuildTest'`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add database/migrations/2026_08_13_000001_create_promotion_time_slots_table.php app/Models/PromotionTimeSlot.php app/Models/Promotion.php
git commit -m "feat: bang promotion_time_slots + model + relation timeSlots"
```

---

### Task 2: PromotionEngine — check khung giờ trong matchesConditions

**Files:**
- Modify: `app/Services/Promotions/PromotionEngine.php` (matchesConditions + 4 eager load)
- Test: `tests/Feature/Services/PromotionEngineTest.php`

**Interfaces:**
- Consumes: `Promotion::timeSlots()` relation (Task 1).
- Produces: `matchesConditions` trả `false` nếu campaign có slots mà thời điểm hiện tại không nằm trong ≥1 slot.

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/Services/PromotionEngineTest.php`:

```php
use App\Models\PromotionTimeSlot;

test('resolveAll: khong trong khung gio vang thi khong ap dung', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);
    // Slot ở NGÀY KHÁC (ngày hôm nay + 3) → luôn không khớp thứ
    $otherDow = (((int) now()->dayOfWeek) + 3) % 7;
    PromotionTimeSlot::create([
        'promotion_id' => $p->id,
        'day_of_week' => $otherDow,
        'start_time' => '00:00',
        'end_time' => '23:59',
    ]);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['promotions'])->toBeEmpty();
    expect($r['total_discount'])->toBe(0.0);
});

test('resolveAll: trong khung gio vang thi ap dung', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);
    // Slot ngày hôm nay, khung rất rộng 00:00–23:59 → luôn khớp
    $dow = (int) now()->dayOfWeek;
    PromotionTimeSlot::create([
        'promotion_id' => $p->id,
        'day_of_week' => $dow,
        'start_time' => '00:00',
        'end_time' => '23:59',
    ]);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});

test('resolveAll: campaign khong co time slot van ap dung binh thuong (backward compat)', function () {
    $p = promoV2(['type' => 'coupon']);
    addAction($p, 'discount_amount', 5000);

    $r = PromotionEngine::resolveAll([$p->code], engineLines(100000), 100000);

    expect($r['status'])->toBe('ok');
    expect($r['total_discount'])->toBe(5000.0);
});


- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionEngineTest'`
Expected: FAIL — campaign có slot vẫn áp dụng (chưa check giờ).

- [ ] **Step 3: Cập nhật `matchesConditions`**

```php
    private static function matchesConditions(Promotion $p, Collection $lines, float $subtotal): bool
    {
        foreach ($p->conditions as $cond) {
            $ok = match ($cond->cond_type) {
                'min_order_value' => $subtotal >= (float) $cond->cond_value,
                'min_quantity' => $lines->sum('quantity') >= (int) $cond->cond_value,
                'specific_product' => $lines->contains(fn ($l) => (int) ($l['menu_item_id'] ?? 0) === (int) $cond->cond_value),
                'specific_category' => self::lineInCategory($lines, (int) $cond->cond_value),
                default => false,
            };
            if (! $ok) {
                return false;
            }
        }

        // Khung giờ vàng: nếu campaign có time_slots thì thời điểm hiện tại phải nằm trong ≥1 slot
        if ($p->timeSlots->isNotEmpty()) {
            $now = now();
            $dow = (int) $now->dayOfWeek; // 0=CN ... 6=T7
            $hm = $now->format('H:i');
            $inSlot = $p->timeSlots->contains(
                fn ($slot) => (int) $slot->day_of_week === $dow
                    && $hm >= $slot->start_time
                    && $hm < $slot->end_time
            );
            if (! $inSlot) {
                return false;
            }
        }

        return true;
    }
```

- [ ] **Step 4: Thêm `timeSlots` vào 4 chỗ eager load**

Thay cả 4 chỗ `->with(['conditions', 'actions'])` thành `->with(['conditions', 'actions', 'timeSlots'])`:
- Dòng ~36: `$promotionQuery = Promotion::query()->with(['conditions', 'actions', 'timeSlots']);`
- Dòng ~62: `$p = $promotion->with(['conditions', 'actions', 'timeSlots'])->first();`
- Dòng ~94: `->with(['conditions', 'actions', 'timeSlots']);`
- Dòng ~252 (trong `candidates`): `->with(['conditions', 'actions', 'timeSlots'])`

- [ ] **Step 5: Chạy test xác nhận pass**

Run: `php artisan test --filter='PromotionEngineTest'`
Expected: PASS (3 test mới + toàn bộ test cũ).

- [ ] **Step 6: Chạy full suite**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/Services/Promotions/PromotionEngine.php tests/Feature/Services/PromotionEngineTest.php
git commit -m "feat: PromotionEngine check khung gio vang trong matchesConditions"
```

---

### Task 3: PromotionController — rules + store/update + index expose time_slots

**Files:**
- Modify: `app/Http/Controllers/Manager/PromotionController.php`
- Test: `tests/Feature/PromotionControllerTest.php`

**Interfaces:**
- Consumes: `Promotion::timeSlots()` relation (Task 1).
- Produces: request fields `time_slots` (array) trên POST/PUT; index payload thêm `time_slots: [{day_of_week, start_time, end_time}]`.

- [ ] **Step 1: Viết failing test**

Thêm vào `tests/Feature/PromotionControllerTest.php`:

```php
test('store luu time_slots: tao dung so dong promotion_time_slots', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Slot campaign',
        'code' => 'SLOT1',
        'time_slots' => [
            ['day_of_week' => 1, 'start_time' => '11:00', 'end_time' => '13:00'],
            ['day_of_week' => 2, 'start_time' => '11:00', 'end_time' => '13:00'],
            ['day_of_week' => 3, 'start_time' => '11:00', 'end_time' => '13:00'],
        ],
        'actions' => [['action_type' => 'discount_percent', 'action_value' => 30]],
    ])->assertSessionHasNoErrors();

    $promo = \App\Models\Promotion::where('name', 'Slot campaign')->first();
    expect($promo->timeSlots)->toHaveCount(3);
    expect($promo->timeSlots->pluck('day_of_week')->sort()->values()->all())->toBe([1, 2, 3]);
});

test('store end_time truoc start_time bi 422', function () {
    $this->actingAs(posAdmin())->post('/manager/promotions', [
        'type' => 'coupon',
        'name' => 'Bad slot',
        'code' => 'BADSLOT',
        'time_slots' => [
            ['day_of_week' => 1, 'start_time' => '13:00', 'end_time' => '11:00'],
        ],
        'actions' => [['action_type' => 'discount_amount', 'action_value' => 5000]],
    ])->assertSessionHasErrors('time_slots.0.end_time');
});

test('index tra time_slots trong payload', function () {
    $this->actingAs(posAdmin());
    $promo = promoV2(['type' => 'coupon', 'code' => 'SLOTIDX']);
    addAction($promo, 'discount_amount', 5000);
    \App\Models\PromotionTimeSlot::create([
        'promotion_id' => $promo->id,
        'day_of_week' => 5,
        'start_time' => '17:00',
        'end_time' => '20:00',
    ]);

    $this->get('/manager/promotions')->assertInertia(fn ($page) => $page->component('manager/promotions/PromotionsManager')
        ->where('promotions.0.id', $promo->id)
        ->where('promotions.0.time_slots.0.day_of_week', 5)
        ->where('promotions.0.time_slots.0.start_time', '17:00'));
});
```

- [ ] **Step 2: Chạy test xác nhận fail**

Run: `php artisan test --filter='PromotionControllerTest'`
Expected: FAIL — time_slots chưa được lưu/trả về.

- [ ] **Step 3: Thêm rules**

Trong `rules()` (sau `code_random`):
```php
'time_slots' => ['nullable', 'array'],
'time_slots.*.day_of_week' => ['required', 'integer', 'between:0,6'],
'time_slots.*.start_time' => ['required', 'date_format:H:i'],
'time_slots.*.end_time' => ['required', 'date_format:H:i', 'after:time_slots.*.start_time'],
```

- [ ] **Step 4: Cập nhật `store`**

Trong `DB::transaction`, sau vòng tạo actions (trước khi đóng transaction), thêm:

```php
            // Khung giờ vàng
            foreach ($validated['time_slots'] ?? [] as $slot) {
                $promotion->timeSlots()->create($slot);
            }
```

- [ ] **Step 5: Cập nhật `update`**

Sau khi xoá conditions/actions cũ và tạo lại, thêm (xoá slot cũ rồi tạo lại — pattern giống conditions):
```php
            $promotion->timeSlots()->delete();
            foreach ($validated['time_slots'] ?? [] as $slot) {
                $promotion->timeSlots()->create($slot);
            }
```

- [ ] **Step 6: Cập nhật `index` payload**

Trong map promotions (sau `actions`), thêm:
```php
'time_slots' => $p->timeSlots->map(fn ($s) => [
    'day_of_week' => $s->day_of_week,
    'start_time' => $s->start_time,
    'end_time' => $s->end_time,
])->values(),
```
Và eager load: `$query = Promotion::with(['conditions', 'actions', 'timeSlots']);` (dòng đầu index, thay `with(['conditions', 'actions'])`).

- [ ] **Step 7: Chạy test xác nhận pass**

Run: `php artisan test --filter='PromotionControllerTest'`
Expected: PASS (3 test mới + toàn bộ test cũ).

- [ ] **Step 8: Chạy full suite**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/Http/Controllers/Manager/PromotionController.php tests/Feature/PromotionControllerTest.php
git commit -m "feat: store/update/index time_slots cho promotion"
```

---

### Task 4: Frontend — form section "Khung giờ vàng"

**Files:**
- Modify: `resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx`
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx` (interface thêm `time_slots`)

**Interfaces:**
- Consumes: campaign payload `time_slots: [{day_of_week, start_time, end_time}]`.
- Produces: form payload gửi `time_slots` (mỗi slot: day_of_week 0–6, start_time 'H:i', end_time 'H:i').

- [ ] **Step 1: Cập nhật `PromotionData` interface**

Trong `PromotionsManager.tsx`, thêm:
```ts
time_slots: { day_of_week: number; start_time: string; end_time: string }[];
```

- [ ] **Step 2: Thêm state + helpers vào form**

```ts
const DAYS = [
    { v: 0, l: 'CN' }, { v: 1, l: 'T2' }, { v: 2, l: 'T3' }, { v: 3, l: 'T4' },
    { v: 4, l: 'T5' }, { v: 5, l: 'T6' }, { v: 6, l: 'T7' },
];

interface SlotRow { days: number[]; start: string; end: string; }

const [timeSlots, setTimeSlots] = useState<SlotRow[]>([]);

const updateSlot = (i: number, patch: Partial<SlotRow>) =>
    setTimeSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
const addSlot = () => setTimeSlots((prev) => [...prev, { days: [], start: '11:00', end: '13:00' }]);
const removeSlot = (i: number) => setTimeSlots((prev) => prev.filter((_, idx) => idx !== i));
const toggleDay = (i: number, d: number) => {
    setTimeSlots((prev) => prev.map((s, idx) => {
        if (idx !== i) return s;
        const has = s.days.includes(d);
        return { ...s, days: has ? s.days.filter((x) => x !== d) : [...s.days, d].sort() };
    }));
};
```

Load khi edit (trong useEffect `promotionToEdit`):
```ts
setTimeSlots((promotionToEdit.time_slots ?? []).map((s) => ({
    days: [s.day_of_week],
    start: s.start_time.slice(0, 5),
    end: s.end_time.slice(0, 5),
})));
```
Reset khi tạo mới: `setTimeSlots([]);`

- [ ] **Step 3: Payload submit**

```ts
time_slots: timeSlots.flatMap((s) =>
    s.days.map((d) => ({ day_of_week: d, start_time: s.start, end_time: s.end }))
),
```

- [ ] **Step 4: Section UI "Khung giờ vàng"**

Trong "Điều kiện & Giới hạn", sau section "Phát hành mã hàng loạt", thêm:

```jsx
<div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 space-y-3">
    <h5 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">Khung giờ vàng (tùy chọn)</h5>
    <p className="text-[11px] text-zinc-500">Chỉ áp dụng khi thời điểm thanh toán nằm trong khung giờ đã chọn. Để trống = áp dụng mọi lúc.</p>
    {timeSlots.map((slot, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
            <div className="flex flex-wrap gap-1.5">
                {DAYS.map((d) => (
                    <button key={d.v} type="button" onClick={() => toggleDay(i, d.v)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                            slot.days.includes(d.v)
                                ? 'bg-sky-600 text-white'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}>
                        {d.l}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-2">
                <input type="time" value={slot.start} onChange={(e) => updateSlot(i, { start: e.target.value })} className={inputCls + ' !w-auto'} />
                <span className="text-xs text-zinc-500">—</span>
                <input type="time" value={slot.end} onChange={(e) => updateSlot(i, { end: e.target.value })} className={inputCls + ' !w-auto'} />
                <button type="button" onClick={() => removeSlot(i)} className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg">
                    <X className="w-4 h-4" />
                </button>
            </div>
            {errors[`time_slots.${i}.end_time`] && <p className="text-xs text-rose-500">{errors[`time_slots.${i}.end_time`]}</p>}
        </div>
    ))}
    <button type="button" onClick={addSlot} className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
        <Plus className="w-3.5 h-3.5" /> Thêm khung giờ
    </button>
</div>
```

`X` đã import trong form; thêm `Plus` vào import lucide.

- [ ] **Step 5: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/manager/promotions/components/PromotionFormDrawer.tsx resources/js/pages/manager/promotions/PromotionsManager.tsx
git commit -m "feat: form khung gio vang (T2-CN + gio bat dau/ket thuc)"
```

---

### Task 5: Hiệu suất batch — cột Hiệu suất ưu tiên % mã đã dùng

**Files:**
- Modify: `resources/js/pages/manager/promotions/PromotionsManager.tsx` (cột perf)

**Interfaces:**
- Consumes: `codes_count`, `codes_used` (đã có trong payload index từ plan batch).
- Produces: cột Hiệu suất hiển thị % mã đã dùng cho batch.

- [ ] **Step 1: Sửa cột perf**

Thay dòng 135 hiện tại:
```ts
const perf = (p.target_usage ?? p.max_usage) ? Math.min(100, Math.round((p.used_count / (p.target_usage ?? p.max_usage!)) * 100)) : null;
```
bằng:
```ts
const perf = p.codes_count > 0
    ? (p.codes_count ? Math.min(100, Math.round((p.codes_used / p.codes_count) * 100)) : null)
    : ((p.target_usage ?? p.max_usage) ? Math.min(100, Math.round((p.used_count / (p.target_usage ?? p.max_usage!)) * 100)) : null);
```

- [ ] **Step 2: Build + type check**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add resources/js/pages/manager/promotions/PromotionsManager.tsx
git commit -m "feat: hieu suat batch = % ma da dung (codes_used/codes_count)"
```

---

### Task 6: Test toàn diện + cleanup

**Files:**
- Toàn bộ thay đổi.

- [ ] **Step 1: Chạy full test suite PHP**

Run: `php artisan test`
Expected: PASS.

- [ ] **Step 2: Type check + build**

Run: `npm run types:check && npm run build`
Expected: PASS.

- [ ] **Step 3: ESLint các file sửa**

Run: `npx eslint resources/js/pages/manager/promotions/`
Expected: không có lỗi mới do thay đổi (bỏ qua lỗi style pre-existing).

- [ ] **Step 4: Kiểm tra git status**

```bash
git status
```
Đảm bảo không có file tạm, không có thay đổi ngoài phạm vi.
