<?php

namespace App\Services\Manager;

use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Bounded min-heap where root is the worst retained candidate:
 * smaller sales_count first, then larger numeric product_id first.
 *
 * @extends \SplHeap<array{product_id: int|string, name: string, sales_count: int}>
 */
class PaidProductMinHeap extends \SplHeap
{
    /**
     * @param  array{product_id: int|string, name: string, sales_count: int}  $a
     * @param  array{product_id: int|string, name: string, sales_count: int}  $b
     */
    protected function compare(mixed $a, mixed $b): int
    {
        // Root is worst retained candidate: smaller count first, then larger numeric ID first.
        if ($a['sales_count'] !== $b['sales_count']) {
            return $b['sales_count'] <=> $a['sales_count'];
        }

        // Numeric ID order, never lexicographic decimal order.
        return (int) $a['product_id'] <=> (int) $b['product_id'];
    }
}

class PaidProductRankingService
{
    public const SOURCE = 'paid_invoice_lines_net_v1';

    public const REFUND_BASIS = 'invoice_line_refunded_qty';

    public const CHUNK_SIZE = 1000;

    public const JS_SAFE_MAX = 9007199254740991;

    /**
     * Serialize product ID for JSON: exact int when JS-safe, decimal string beyond.
     * Numeric tie ordering always uses backend ints; this only affects output encoding.
     */
    public static function serializeProductId(int $id): int|string
    {
        return $id > self::JS_SAFE_MAX ? (string) $id : $id;
    }

    /**
     * Rank paid invoice lines by durable product identity using chunk scan,
     * HashMap aggregation, and bounded min-heap selection.
     *
     * Consistent-read honesty: the chunk scan runs in one DB transaction on one
     * connection with no explicit isolation/lock hints. SQLite (DEFERRED) serializes
     * writers via locks, not MVCC snapshots; MySQL InnoDB defaults to REPEATABLE READ
     * which snapshots the first SELECT, but READ-COMMITTED or other engines can mix
     * source versions between chunks. Callers must not claim snapshot guarantees
     * beyond what the runtime DB actually provides; post-commit invalidation via
     * dashboard source revision is the correctness backstop, not the transaction alone.
     *
     * @return array{
     *     items: array<int, array{product_id: int|string, name: string, sales_count: int}>,
     *     metadata: array{
     *         source: string,
     *         refund_basis: string,
     *         unidentified_line_count: int,
     *         unidentified_net_quantity: int,
     *         invalid_line_count: int,
     *         generated_at: string
     *     }
     * }
     */
    public function rank(CarbonInterface $startInclusive, CarbonInterface $endExclusive, int $k): array
    {
        /** @var array{items: array<int, array{product_id: int, name: string, sales_count: int}>, metadata: array{source: string, refund_basis: string, unidentified_line_count: int, unidentified_net_quantity: int, invalid_line_count: int, generated_at: string}} $result */
        $result = DB::transaction(function () use ($startInclusive, $endExclusive, $k): array {
            $unidentifiedLineCount = 0;
            $unidentifiedNetQuantity = 0;
            $invalidLineCount = 0;

            /** @var array<int, array{product_id: int, name: string, sales_count: int, latest_time: int, latest_line_id: int}> $map */
            $map = [];
            // ponytail: label tracks most recent eligible line even when its net<=0;
            // sales_count still sums net, zero-total products omitted at heap stage.

            $query = DB::table('invoice_lines')
                ->join('invoices', 'invoices.id', '=', 'invoice_lines.invoice_id')
                ->whereNotNull('invoices.payment_method')
                ->where('invoices.payment_method', '!=', '')
                ->whereNull('invoices.synthetic_dataset_id')
                ->where('invoices.issued_at', '>=', $startInclusive)
                ->where('invoices.issued_at', '<', $endExclusive)
                ->select([
                    'invoice_lines.id as line_id',
                    'invoice_lines.menu_item_id',
                    'invoice_lines.name_snapshot',
                    'invoice_lines.quantity',
                    'invoice_lines.refunded_qty',
                    'invoices.issued_at',
                ]);

            $query->chunkById(self::CHUNK_SIZE, function (Collection $chunk) use (
                &$map,
                &$unidentifiedLineCount,
                &$unidentifiedNetQuantity,
                &$invalidLineCount
            ): void {
                foreach ($chunk as $row) {
                    /** @var \stdClass $row */
                    $quantity = (int) $row->quantity;
                    $refundedQty = (int) ($row->refunded_qty ?? 0);

                    // Skip invalid lines: negative quantity, negative refund, or refund > quantity
                    if ($quantity < 0 || $refundedQty < 0 || $refundedQty > $quantity) {
                        $invalidLineCount++;

                        continue;
                    }

                    $net = $quantity - $refundedQty;

                    // Skip lines without valid numeric product ID and track coverage
                    if ($row->menu_item_id === null || ! is_numeric($row->menu_item_id)) {
                        $unidentifiedLineCount++;
                        $unidentifiedNetQuantity += $net;

                        continue;
                    }

                    $productId = (int) $row->menu_item_id;
                    $lineId = (int) $row->line_id;
                    $rawIssued = (string) $row->issued_at;
                    $baseSec = (int) strtotime($rawIssued);
                    $micros = 0;
                    if (str_contains($rawIssued, '.')) {
                        $frac = explode('.', $rawIssued, 2)[1] ?? '';
                        $frac = (string) preg_replace('/[^0-9].*$/', '', $frac);
                        if ($frac !== '') {
                            $micros = (int) substr(str_pad($frac, 6, '0'), 0, 6);
                        }
                    }
                    $issuedAtTime = $baseSec * 1000000 + $micros;
                    $rawName = is_string($row->name_snapshot) ? trim($row->name_snapshot) : '';
                    $name = $rawName !== '' ? $rawName : 'Món #'.$productId;

                    if (! isset($map[$productId])) {
                        $map[$productId] = [
                            'product_id' => $productId,
                            'name' => $name,
                            'sales_count' => $net,
                            'latest_time' => $issuedAtTime,
                            'latest_line_id' => $lineId,
                        ];
                    } else {
                        $map[$productId]['sales_count'] += $net;

                        $isMoreRecent = $issuedAtTime > $map[$productId]['latest_time']
                            || ($issuedAtTime === $map[$productId]['latest_time'] && $lineId > $map[$productId]['latest_line_id']);

                        if ($isMoreRecent) {
                            $map[$productId]['latest_time'] = $issuedAtTime;
                            $map[$productId]['latest_line_id'] = $lineId;
                            $map[$productId]['name'] = $name;
                        }
                    }
                }
            }, 'invoice_lines.id', 'line_id');

            // Select Top-K using size-K min-heap
            $items = [];
            if ($k > 0) {
                $heap = new PaidProductMinHeap;

                foreach ($map as $candidate) {
                    if ($candidate['sales_count'] <= 0) {
                        continue;
                    }

                    $item = [
                        'product_id' => $candidate['product_id'],
                        'name' => $candidate['name'],
                        'sales_count' => $candidate['sales_count'],
                    ];

                    if ($heap->count() < $k) {
                        $heap->insert($item);
                    } else {
                        $root = $heap->top();
                        // Candidate is better if larger count, or equal count and smaller numeric ID
                        $isBetter = $item['sales_count'] > $root['sales_count']
                            || ($item['sales_count'] === $root['sales_count'] && $item['product_id'] < $root['product_id']);

                        if ($isBetter) {
                            $heap->extract();
                            $heap->insert($item);
                        }
                    }
                }

                while (! $heap->isEmpty()) {
                    $items[] = $heap->extract();
                }

                // Final sort: sales_count descending, product_id ascending (numeric, never lexicographic)
                usort($items, function (array $a, array $b): int {
                    if ($a['sales_count'] !== $b['sales_count']) {
                        return $b['sales_count'] <=> $a['sales_count'];
                    }

                    return (int) $a['product_id'] <=> (int) $b['product_id'];
                });

                // Decimal-string rule: exact ints when JS-safe, strings beyond.
                foreach ($items as &$row) {
                    $row['product_id'] = self::serializeProductId((int) $row['product_id']);
                }
                unset($row);
            }

            return [
                'items' => $items,
                'metadata' => [
                    'source' => self::SOURCE,
                    'refund_basis' => self::REFUND_BASIS,
                    'unidentified_line_count' => $unidentifiedLineCount,
                    'unidentified_net_quantity' => $unidentifiedNetQuantity,
                    'invalid_line_count' => $invalidLineCount,
                    'generated_at' => now()->toIso8601String(),
                ],
            ];
        });

        return $result;
    }
}
