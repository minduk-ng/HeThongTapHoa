<?php

namespace App\Services\Forecasting;

use Illuminate\Support\Str;

class InventoryOptimizer
{
    /**
     * Recommend inventory reorder quantity and track intermediate stages.
     */
    public function recommend(InventoryInput $input): InventoryDecision
    {
        $available = (float) $input->available;
        $reserved = (float) $input->reserved;
        $leadDays = max(0.0, (float) $input->leadDays);
        $dailyDemandStdDev = max(0.0, (float) $input->dailyDemandStdDev);
        $serviceFactor = max(0.0, (float) $input->serviceFactor);

        // ponytail: SS = z * sigma_d * sqrt(L) (Spec Section 10.2)
        $safetyStock = round($serviceFactor * $dailyDemandStdDev * sqrt($leadDays), 4);

        // ponytail: demand during lead time priority: explicit leadDemand, dailyDemand * leadDays, annualDemand/365 * leadDays
        if ($input->leadDemand !== null) {
            $demandDuringLeadTime = max(0.0, (float) $input->leadDemand);
        } elseif ($input->dailyDemand !== null) {
            $demandDuringLeadTime = max(0.0, (float) $input->dailyDemand) * $leadDays;
        } elseif ($input->annualDemand !== null && (float) $input->annualDemand > 0) {
            $demandDuringLeadTime = ((float) $input->annualDemand / 365.0) * $leadDays;
        } else {
            $demandDuringLeadTime = 0.0;
        }

        // ponytail: ROP = DemandDuringLeadTime + SS (Spec Section 10.3)
        $reorderPoint = round($demandDuringLeadTime + $safetyStock, 4);

        $isEoqValid = ($input->annualDemand !== null && (float) $input->annualDemand > 0)
            && ($input->orderingCost !== null && (float) $input->orderingCost > 0)
            && ($input->annualHoldingCost !== null && (float) $input->annualHoldingCost > 0);

        // ponytail: order triggered only when available <= ROP (Spec Section 10.3/10.5)
        $triggersOrder = $available <= $reorderPoint;

        if (! $triggersOrder) {
            return new InventoryDecision(
                safetyStock: $safetyStock,
                reorderPoint: $reorderPoint,
                rawQuantity: 0.0,
                afterMoqQuantity: 0.0,
                finalQuantity: 0.0,
                suggestedQuantity: 0.0,
                method: $isEoqValid ? 'eoq' : 'reorder_gap',
                triggersOrder: false,
                available: $available,
                reserved: $reserved,
                notes: 'Available stock exceeds reorder point. No reorder required.',
            );
        }

        if ($isEoqValid) {
            $method = 'eoq';
            $rawQuantity = sqrt((2.0 * (float) $input->annualDemand * (float) $input->orderingCost) / (float) $input->annualHoldingCost);
        } else {
            $method = 'reorder_gap';
            $rawQuantity = max(0.0, $reorderPoint - $available);
        }
        $rawQuantity = round($rawQuantity, 4);

        // ponytail: apply MOQ = max(raw_quantity, MOQ)
        $moq = max(0.0, (float) $input->moq);
        $afterMoqQuantity = max($rawQuantity, $moq);
        $afterMoqQuantity = round($afterMoqQuantity, 4);

        // ponytail: round up to next multiple of orderMultiple
        $orderMultiple = (float) $input->orderMultiple;
        if ($orderMultiple > 0) {
            $steps = (int) ceil(round($afterMoqQuantity / $orderMultiple, 8));
            $finalQuantity = (float) ($steps * $orderMultiple);
        } else {
            $finalQuantity = $afterMoqQuantity;
        }
        $finalQuantity = round($finalQuantity, 4);

        return new InventoryDecision(
            safetyStock: $safetyStock,
            reorderPoint: $reorderPoint,
            rawQuantity: $rawQuantity,
            afterMoqQuantity: $afterMoqQuantity,
            finalQuantity: $finalQuantity,
            suggestedQuantity: $finalQuantity,
            method: $method,
            triggersOrder: true,
            available: $available,
            reserved: $reserved,
        );
    }
}

class InventoryInput
{
    public function __construct(
        public float $available,
        public float $dailyDemandStdDev,
        public int|float $leadDays,
        public float $serviceFactor = 1.65,
        public ?float $annualDemand = null,
        public ?float $orderingCost = null,
        public ?float $annualHoldingCost = null,
        public float $moq = 0.0,
        public float $orderMultiple = 1.0,
        public float $packSize = 1.0,
        public ?float $leadDemand = null,
        public ?float $dailyDemand = null,
        public float $reserved = 0.0,
    ) {}
}

class InventoryDecision
{
    public function __construct(
        public float $safetyStock,
        public float $reorderPoint,
        public float $rawQuantity,
        public float $afterMoqQuantity,
        public float $finalQuantity,
        public float $suggestedQuantity,
        public string $method,
        public bool $triggersOrder,
        public float $available,
        public float $reserved = 0.0,
        public ?string $notes = null,
    ) {}

    public function __get(string $name): mixed
    {
        $camel = Str::camel($name);
        if (property_exists($this, $camel)) {
            return $this->{$camel};
        }

        return null;
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'safety_stock' => $this->safetyStock,
            'reorder_point' => $this->reorderPoint,
            'raw_quantity' => $this->rawQuantity,
            'after_moq_quantity' => $this->afterMoqQuantity,
            'final_quantity' => $this->finalQuantity,
            'suggested_quantity' => $this->suggestedQuantity,
            'method' => $this->method,
            'triggers_order' => $this->triggersOrder,
            'available' => $this->available,
            'reserved' => $this->reserved,
            'notes' => $this->notes,
        ];
    }
}
