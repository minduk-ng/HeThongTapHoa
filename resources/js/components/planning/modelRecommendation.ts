export interface RecommendationCandidate {
    model_key: string;
    selected_count?: number;
    avg_wape: number | null;
}

export function recommendedModelKeys(
    rows: readonly RecommendationCandidate[],
): string[] {
    const selected = rows.filter((row) => (row.selected_count ?? 0) > 0);

    if (!selected.length) {
        return [];
    }

    const count = Math.max(...selected.map((row) => row.selected_count ?? 0));
    const finalists = selected.filter((row) => row.selected_count === count);
    const score = (row: RecommendationCandidate) =>
        row.avg_wape !== null && Number.isFinite(row.avg_wape)
            ? row.avg_wape
            : Infinity;
    const best = Math.min(...finalists.map(score));

    return finalists
        .filter((row) => score(row) === best)
        .map((row) => row.model_key);
}
