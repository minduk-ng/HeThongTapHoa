export type ForecastMetric = number | null;

export type ForecastStatus = 'available' | 'unavailable';

export type EvaluationStage = 'validation' | 'holdout';

export interface ForecastValue {
    forecast_quantity: number | null;
    status: ForecastStatus;
    model_key: string | null;
    bound_method: 'fixed_percentage' | null;
    bound_percentage: number | null;
    lower_bound: number | null;
    upper_bound: number | null;
}

export interface ModelComparisonItem {
    model_key: string;
    name: string;
    avg_mae: number | null;
    avg_rmse: number | null;
    avg_wape: number | null;
    selected_count: number;
    origins_count: number;
    is_selected: boolean;
    parameters: Record<string, unknown>;
}

export interface RecommendationExplanation {
    lead_demand: number;
    lead_days: number;
    daily_demand_stddev: number;
    safety_stock: number;
    reorder_point: number;
    raw_quantity: number;
    after_moq_quantity: number;
    final_quantity: number;
    method: string;
    pack_size: number;
    base_unit: string;
    purchase_unit: string;
    stock_snapshot_quantity: number;
    assumptions?: {
        reserved: number;
        inbound_pipeline_included: boolean;
        perishability_penalty_included: boolean;
    };
}
