# Order List & Audit Log — Design Spec

## Overview

Trang quản lý "Danh sách Order" cho phép xem toàn bộ orders theo thời gian, lọc theo loại đơn, tìm theo mã hóa đơn, và drill-down vào chi tiết từng order để xem timeline hoạt động (audit trail). Backend ghi log đồng bộ trong transaction để đảm bảo nhất quán dữ liệu.

## Decisions

| Quyết định | Lựa chọn |
|---|---|
| Granularity | Order-level timeline, meta JSON chứa chi tiết items |
| Logging | Synchronous trong DB::transaction() |
| Service | `OrderActivityLogger::log()` static method |
| Takeaway | `table_id IS NULL`, migrate id 15 → NULL, xóa bàn "Mang đi" |
| Backfill | Không — orders cũ có timeline trống |
| User reference | `user_id` FK → JOIN users lấy email/name |
| Phân quyền | Nhóm Quản lý (Manager/Admin) |

## Database Schema

### Bảng mới: `order_activities`

```sql
CREATE TABLE order_activities (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    order_id    BIGINT UNSIGNED NOT NULL,
    action      VARCHAR(30) NOT NULL,
    user_id     BIGINT UNSIGNED NULL,
    meta        JSON NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,

    INDEX idx_order_timeline (order_id, created_at),
    INDEX idx_action (action)
);
```

- `action`: `created`, `sent_kitchen`, `additional`, `item_cancel`, `order_cancel`, `completed`, `served`, `paid`
- `meta`: JSON chi tiết (items, quantities, reasons, invoice info)
- Immutable — không có `updated_at`

### Migration takeaway (cùng file)

```sql
UPDATE orders SET table_id = NULL WHERE table_id = 15;
DELETE FROM tables WHERE id = 15;
```

### Order code cho takeaway

Khi `table_id IS NULL`: prefix `MD` → `MD-260728-01`

## Meta Structure

```php
// created
['items' => [['name' => 'Cà phê sữa', 'qty' => 2, 'price' => 25000]], 'total' => 90000, 'item_count' => 2]

// sent_kitchen
['items' => [['name' => 'Cà phê sữa', 'qty' => 2]], 'is_additional' => false]

// additional
['items' => [['name' => 'Bánh mì', 'qty' => 1, 'price' => 30000]], 'total_added' => 30000]

// item_cancel
['items' => [['name' => 'Trà đào', 'qty' => 1, 'reason' => 'Khách đổi ý']]]

// order_cancel
['reason' => 'Khách bỏ về', 'total_lost' => 90000]

// completed
[]

// served
['items' => [['name' => 'Cà phê sữa', 'qty' => 2]]]

// paid
['invoice_code' => 'INV-20260728X4K2', 'total' => 90000, 'received' => 100000, 'change' => 10000, 'method' => 'cash', 'discount_amount' => 0, 'discount_percent' => 0]
```

## Service Class

```php
// app/Services/OrderActivityLogger.php
namespace App\Services;

use App\Models\Order;
use App\Models\OrderActivity;

class OrderActivityLogger
{
    public static function log(Order $order, string $action, ?int $userId = null, array $meta = []): void
    {
        OrderActivity::create([
            'order_id' => $order->id,
            'action' => $action,
            'user_id' => $userId,
            'meta' => $meta ?: null,
        ]);
    }
}
```

## Integration Points

| # | Controller::method | Action | Vị trí gọi |
|---|---|---|---|
| 1 | `POSController::sendToKitchen` | `created` + `sent_kitchen` (order mới) | Trong transaction, sau tạo order + items |
| 2 | `POSController::sendToKitchen` | `additional` (order đã có) | Trong transaction, sau thêm items |
| 3 | `POSController::sendToKitchen` (reduced_items) | `item_cancel` | Trong transaction, sau cancel/reduce |
| 4 | `POSController::cancelOrder` | `order_cancel` | Trong transaction, sau update status |
| 5 | `KitchenController::completeOrder` | `completed` | Trong transaction, sau update status |
| 6 | `ServingController::markServed` | `served` | Trong transaction, sau update served_at |
| 7 | `POSController::checkout` | `paid` | Trong transaction, sau tạo Invoice |

### Nguyên tắc

- Log TRONG `DB::transaction()` → fail = rollback toàn bộ
- Event dispatch SAU transaction commit (không đổi)
- Không try/catch riêng cho log — log fail = transaction fail

## Model

```php
// app/Models/OrderActivity.php
class OrderActivity extends Model
{
    public $timestamps = false;
    protected $fillable = ['order_id', 'action', 'user_id', 'meta', 'created_at'];
    protected $casts = ['meta' => 'array', 'created_at' => 'datetime'];

    public function order() { return $this->belongsTo(Order::class); }
    public function user()  { return $this->belongsTo(User::class); }
}

// Order model — thêm relation:
public function activities() { return $this->hasMany(OrderActivity::class)->orderBy('created_at'); }
```

## Routes & Controller

```php
// routes/web.php — nhóm Manager
Route::get('/manager/orders', [OrderListController::class, 'index'])->name('manager.orders');
Route::get('/manager/orders/{order}', [OrderListController::class, 'show'])->name('manager.orders.show');
```

### `index` — Danh sách + Stats

- Filters: `from`, `to` (date range, mặc định hôm nay)
- Stats: total, open (pending/confirmed/processing/completed), paid, cancelled
- Load TẤT CẢ orders trong khoảng thời gian (không paginate server-side)
- Frontend xử lý: tìm mã HĐ, lọc loại đơn, phân trang (giống ProductTable)
- Render: `manager/orders/OrderList`

### `show` — Chi tiết + Timeline

- Load: `table`, `items.menuItem`, `invoice`, `activities.user`
- Render: `manager/orders/OrderDetail`

## UI/UX — Order List Page

### Summary Cards (grid-cols-4)

| Card | Icon | Color | Value |
|------|------|-------|-------|
| Tổng order | ClipboardList | sky | stats.total |
| Đang mở | Clock | amber | stats.open |
| Đã thanh toán | CheckCircle | emerald | stats.paid |
| Đã hủy | XCircle | rose | stats.cancelled |

### Filters (1 hàng, xử lý frontend)

- Từ ngày / Đến ngày: `<input type="date">`, mặc định = hôm nay (gửi query param lên backend)
- Loại đơn: select Tất cả / Tại bàn / Mang đi (filter frontend trên data đã load)
- Tìm mã HĐ: text input (filter frontend trên data đã load)

### Table Columns (fit 1200px, no horizontal scroll)

| # | Cột | Width | Align | Style |
|---|-----|-------|-------|-------|
| 1 | Mã đơn | w-[130px] | left | font-mono text-xs text-sky-600 |
| 2 | Vị trí | w-[90px] | left | text-sm |
| 3 | Tổng tiền | w-[110px] | right | font-medium tabular-nums text-emerald-600 |
| 4 | Trạng thái | w-[100px] | center | badge rounded-full text-xs |
| 5 | Thanh toán | w-[90px] | center | badge rounded-full text-xs |
| 6 | HTTT | w-[110px] | left | text-xs text-zinc-500 |
| 7 | Ngày tạo | w-[120px] | left | text-xs tabular-nums |
| 8 | Ngày đóng | w-[120px] | left | text-xs tabular-nums |
| 9 | Xem | w-[50px] | center | Eye icon button |

### Badge Colors

- Trạng thái: Đang mở = sky, Đã đóng = emerald, Đã hủy = rose
- Thanh toán: Đã TT = emerald, Chưa TT = amber

### Footer

Giống ProductTable: compact toggle + page size (20/50/100) + pagination

## UI/UX — Order Detail Page

### Header

- Nút "← Quay lại" + order code lớn

### Tabs: "Chi tiết" | "Lịch sử"

### Tab Chi tiết

3 sections:
1. **Thông tin chung**: mã đơn, vị trí, trạng thái, ngày tạo, ngày đóng, nhân viên
2. **Danh sách món**: table (món, SL, đơn giá, thành tiền, trạng thái item)
3. **Thanh toán**: mã HĐ, hình thức, tổng, khách trả, tiền thừa, thời điểm

### Tab Lịch sử (Timeline)

Vertical timeline giống ThinkBox POS:
- Chấm tròn: xanh (emerald) cho action thường, đỏ (rose) cho cancel
- Đường nối: border-l-2 border-zinc-200
- Mỗi entry: tiêu đề action + timestamp (right) + user email + meta details
- Spacing: pb-6 giữa entries

### Action Labels (frontend)

```ts
const ACTION_LABELS: Record<string, string> = {
    created: 'Tạo mới hóa đơn',
    sent_kitchen: 'Gửi bếp chế biến',
    additional: 'Gọi thêm món',
    item_cancel: 'Hủy món',
    order_cancel: 'Hủy toàn bộ đơn',
    completed: 'Bếp hoàn thành',
    served: 'Đã phục vụ',
    paid: 'Thanh toán hóa đơn',
};
```

## POS Frontend Change — Takeaway

- Xóa bàn "Mang đi" khỏi grid
- Thêm nút/toggle "Mang đi" riêng → gửi `table_id: null`
- Order code prefix: `MD` khi table_id null

## Optimistic UI (future enhancement)

- Click action → UI lập tức chuyển trạng thái optimistic
- Server sync write bình thường
- On error → items nhấp nháy đỏ sau 1-3s, nhân viên thao tác lại
- Áp dụng cho: Gửi bếp, Bếp hoàn thành, Phục vụ
