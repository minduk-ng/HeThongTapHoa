export interface ForecastCheckPoint {
    date: string;
    actual: number | null;
    predicted: number | null;
    signed_error: number | null;
    absolute_error: number | null;
    scored: boolean;
    is_open: boolean;
    is_missing: boolean;
    is_stockout: boolean;
}

export interface ForecastCheckCandidate {
    model_key: string;
    parameters: Record<string, unknown>;
    status: 'evaluated' | 'skipped' | 'failed';
    reason: string | null;
    predictions: number[];
    mae: number | null;
    rmse: number | null;
    wape: number | null;
    scored_count: number;
    observed_total: number | null;
    predicted_scored_total: number | null;
    predicted_seven_day_total: number | null;
    points: ForecastCheckPoint[];
}

export interface ForecastCheckTrainingSummary {
    cutoff: string;
    quality: string;
    counts: {
        observed: number;
        zero: number;
        missing: number;
        imputed: number;
        stockout: number;
        closed: number;
        dropped_leading: number;
    };
    unavailable_reason: string | null;
}

export interface ForecastCheckResult {
    history: Array<{
        date: string;
        observed_sales: number | null;
        is_open?: boolean;
        is_missing?: boolean;
        is_stockout?: boolean;
    }>;
    actuals: Array<{
        date: string;
        observed_sales: number | null;
        is_open?: boolean;
        is_missing?: boolean;
        is_stockout?: boolean;
    }>;
    training: ForecastCheckTrainingSummary;
    candidates: ForecastCheckCandidate[];
    default_model_key: string | null;
    best_model_keys: string[];
    ranking_metric: 'wape' | 'mae' | null;
    scored_count: number;
    versions: Record<string, string>;
}

export interface ForecastCheckItem {
    id: number;
    created_by?: number | null;
    synthetic_dataset_id?: number | null;
    menu_item_id?: number | null;
    submission_token: string;
    request_hash: string;
    dataset_label: string;
    item_label: string;
    start_date: string;
    end_date: string;
    cutoff: string;
    input_snapshot: Record<string, unknown>;
    result?: ForecastCheckResult | null;
    status: 'queued' | 'running' | 'completed' | 'failed';
    error_message?: string | null;
    attempts: number;
    started_at?: string | null;
    completed_at?: string | null;
    created_at?: string | null;
}

export interface SyntheticDatasetOption {
    id: number;
    name: string;
    seed: number;
    start_date?: string | null;
    end_date?: string | null;
    dataset_hash?: string | null;
    generator_version?: string | null;
    configuration?: {
        days?: number;
        start_date?: string;
        menu_item_ids?: number[];
        preset?: string;
    } | null;
}
