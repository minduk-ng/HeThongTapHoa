# POS/Frontend Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa vi phạm Rules of Hooks trong `PaymentDrawer` (early-return trước hooks) và tách flag "đã áp mã KM" khỏi số tiền giảm giá để mã hợp lệ giảm 0đ vẫn hiển thị như đã áp.

**Architecture:** Chuyển toàn bộ hooks lên đầu component, các giá trị derived xuống sau hooks, gate render `if (!isOpen || !selectedTable) return null;` xuống cuối ngay trước `return (...)`. Thêm state `promotionName` trong `usePOSCheckout`; `PaymentDrawer` dùng `promotionName != null && promotionName !== ''` làm flag đã áp thay cho `promotionDiscount > 0`.

**Tech Stack:** React + TypeScript + Inertia.js, Vite, Tailwind. Không có test framework JS — kiểm chứng bằng `npm run types:check`, `npm run lint`, `npm run build`.

## Global Constraints

- KHÔNG đổi logic kinh doanh — chỉ sắp lại thứ tự hooks/derived và đổi điều kiện hiển thị.
- Không thêm test framework JS mới (vitest/jest); hành vi backend kiểm bằng Pest (spec backend Task 3).
- `promotionName` phải là string nullable; `promotionCode === null` khi chưa áp.
- Kiểm chứng sau mỗi task: `npm run types:check`, `npm run lint`, `npm run build` (PowerShell: dùng `;`, không `&&`).
- Phụ thuộc backend: endpoint `validate-promotion` khi `ok:true` phải trả `promotion: { id, name, code }` (đang được triển khai ở plan backend Task 3).

---

## File Structure

- `resources/js/pages/staff/pos/hooks/usePOSCheckout.ts` — thêm state `promotionName`, set khi apply, clear khi clear, expose.
- `resources/js/pages/staff/pos/components/PaymentDrawer.tsx` — sắp lại hooks; thêm prop `promotionName`; đổi flag hiển thị.
- `resources/js/pages/staff/pos/POSManager.tsx` — destructure `promotionName` và truyền xuống `PaymentDrawer`.

---

### Task 1: usePOSCheckout — thêm state promotionName

**Files:**
- Modify: `resources/js/pages/staff/pos/hooks/usePOSCheckout.ts`

**Interfaces:**
- Produces: từ hook trả thêm `promotionName: string | null` (nullable), set trong `applyPromotion` khi ok (lấy từ `data.promotion?.name`), clear trong `clearPromotion` cùng `promotionCode`.
- Consumes: (none)

- [ ] **Step 1: Thêm state khai báo cạnh promotionCode**

Trong `usePOSCheckout`, sau dòng khai báo `promotionDiscount`:

```ts
const [promotionCode, setPromotionCode] = useState<string | null>(null);
const [promotionDiscount, setPromotionDiscount] = useState(0);
const [promotionName, setPromotionName] = useState<string | null>(null);
```

- [ ] **Step 2: Set promotionName trong applyPromotion khi ok**

Cập nhật khối `if (response.ok && data.ok)` trong `applyPromotion`:

```ts
if (response.ok && data.ok) {
    setPromotionCode(code);
    setPromotionDiscount(data.discount_amount || 0);
    setPromotionName(data.promotion?.name || null);
    return {
        ok: true,
        discount_amount: data.discount_amount,
        total: data.total,
    };
}
```

- [ ] **Step 3: Clear trong clearPromotion**

```ts
const clearPromotion = () => {
    setPromotionCode(null);
    setPromotionDiscount(0);
    setPromotionName(null);
};
```

- [ ] **Step 4: Expose trong return**

Trong object return cuối hook, sau `promotionCode`:

```ts
promotionCode,
promotionName,
promotionDiscount,
```

- [ ] **Step 5: Kiểm chứng**

Run: `npm run types:check; if ($?) { npm run lint }`
Expected: không có lỗi type/lint mới.

- [ ] **Step 6: Commit**

```bash
git add resources/js/pages/staff/pos/hooks/usePOSCheckout.ts
git commit -m "feat: them promotionName state trong usePOSCheckout"
```

---

### Task 2: PaymentDrawer — sắp lại Rules of Hooks + flag đã áp

**Files:**
- Modify: `resources/js/pages/staff/pos/components/PaymentDrawer.tsx`

**Interfaces:**
- Consumes: prop mới `promotionName?: string | null`; `promotionDiscount` (giữ nguyên).
- Produces: `promotionApplied: boolean` (bool) tính trong component.

- [ ] **Step 1: Thêm prop promotionName**

Trong interface `PaymentDrawerProps` và default destructuring:

```ts
promotionDiscount?: number;
promotionName?: string | null;
```

```ts
promotionDiscount = 0,
promotionName = null,
```

- [ ] **Step 2: Sắp lại hooks — BỎ early return dòng 40, chuyển giữa hooks**

Xóa dòng:
```ts
if (!isOpen || !selectedTable) return null;
```

- [ ] **Step 3: Di chuyển các derived xuống sau hooks**

Chuyển các dòng sau (hiện đặt TRƯỚC `useState`) xuống NGAY SAU khối `useState` (ẩn sau khai báo `promotionLoading`):

```ts
const [promotionLoading, setPromotionLoading] = useState(false);
```
mới thành:
```ts
const [promotionLoading, setPromotionLoading] = useState(false);

const subtotal = cartItems.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
const vatTotal = cartItems.reduce((sum, item) => {
    const itemSubtotal = item.quantity * item.unit_price;
    return sum + itemSubtotal * ((item.vat_rate || 0) / 100);
}, 0);
const totalAmount = subtotal;

const discountedTotal = Math.max(0, totalAmount - promotionDiscount);
const payable = Math.max(0, discountedTotal - depositTotal);
const depositRefund = Math.max(0, depositTotal - discountedTotal);
```

> Lưu ý: `useEffect` reset đã phụ thuộc `[isOpen, mode, payable, totalAmount]` — giờ `payable`/`totalAmount` được khai báo trước `useEffect` vì derived đặt sau `useState` nhưng trước `useEffect`. Thứ tự base: `useState` (53-57) → derived → `useEffect` (reset). Không đổi logic.

- [ ] **Step 4: Thêm `promotionApplied` flag sau khối derived**

Đặt cạnh `changeAmount`:

```ts
const promotionApplied = promotionName != null && promotionName !== '';
```

- [ ] **Step 5: Đổi điều kiện disabled + Hủy mã (dòng 244, 248)**

Người dùng dòng 244: `disabled={promotionDiscount > 0}` → `disabled={promotionApplied}`

Người dùng dòng 248:
```tsx
{promotionApplied ? (
    <button type="button" onClick={() => { onClearPromotion?.(); setPromotionInput(''); setPromotionError(null); }} className="rounded-xl border border-zinc-300 px-3 py-2 text-xs font-semibold dark:border-zinc-700">
        Hủy mã
    </button>
) : (
    ... btn Áp dụng giữ nguyên
)}
```

- [ ] **Step 6: Hiển thị badge + dòng giảm giá luôn khi áp (kể cả 0đ)**

Thay khối dòng 272:
```tsx
{mode === 'payment' && promotionApplied && (
    <div className="flex justify-between border-t border-sky-200/60 pt-2 text-xs font-semibold text-rose-600 dark:border-sky-800/60 dark:text-rose-400">
        <span className="flex items-center gap-1"><Tag className="h-3.5 w-3.5 stroke-[1.5]" />{promotionName} (−{promotionDiscount.toLocaleString('vi-VN')} đ):</span>
    </div>
)}
```

- [ ] **Step 7: Gate render cuối (trước return)**

Sau khi đã khai báo hết hooks/derived, Đặt lại ngay trước câu `return (` (dòng ~135):

```ts
if (!isOpen || !selectedTable) return null;
```

> Lưu ý không đặt lại TRƯỚC bất kỳ hook nào — đảm bảo mọi lần render gọi đủ hooks.

- [ ] **Step 8: Kiểm chứng**

Run: `npm run types:check; if ($?) { npm run lint; if ($?) { npm run build } }`

if: không lỗi type/lint, build thành công.

- [ ] **Step 9: Commit**

```bash
git add resources/js/pages/staff/pos/components/PaymentDrawer.tsx
git commit -m "fix: hoan thien Rules of Hooks va hien thi promotion 0 dong da ap"
```

---

### Task 3: POSManager — truyền promotionName xuống PaymentDrawer

**Files:**
- Modify: `resources/js/pages/staff/pos/POSManager.tsx`

**Interfaces:**
- Consumes: `usePOSCheckout` giờ expose `promotionName`.
- Produces: `PaymentDrawer` nhận prop `promotionName`.

- [ ] **Step 1: Destructure promotionName**

Trong khối destructure từ `usePOSCheckout` (dòng ~187-200), thêm sau `promotionDiscount`:

```ts
promotionDiscount,
promotionName,
applyPromotion,
```

- [ ] **Step 2: Truyền prop xuống PaymentDrawer (dòng ~403)**

Trong JSX `PaymentDrawer`, sau `promotionDiscount={promotionDiscount}`:

```tsx
promotionDiscount={promotionDiscount}
promotionName={promotionName}
```

- [ ] **Step 3: Kiểm chứng**

Run: `npm run types:check; if ($?) { npm run lint; if ($?) { npm run build } }`

- [ ] **Step 4: Commit**

```bash
git add resources/js/pages/staff/pos/POSManager.tsx
git commit -m "feat: truyen promotionName vao PaymentDrawer"
```

---

### Final verification

- [ ] **Chạy type-check + lint + build toàn bộ**

```bash
npm run types:check; if ($?) { npm run lint; if ($?) { npm run build } }
```

Expected: không lỗi type, lint, build pass.

- [ ] **Chạy toàn bộ suite Pest backend (đã được plan backend lo) — nếu chưa chạy chung:**

```bash
php artisan test
```

Expected: pass (~170+ tests).