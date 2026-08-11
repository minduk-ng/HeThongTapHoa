import React from 'react';
import { Image as ImageIcon, Edit3 } from 'lucide-react';
import DataTable, { DataTableColumn } from '../../../../../components/DataTable';
import { cdnAsset } from '../../../../../utils/cdn';

export interface RecipeItem {
    id: number;
    product_id: number;
    ingredient_id: number;
    amount: number;
    unit: string;
    ingredient?: {
        id: number;
        name: string;
        cost_price: number;
        unit: string;
    };
}

export interface ProductRecipeData {
    id: number;
    name: string;
    price: number;
    image: string | null;
    category_id: number | null;
    category?: {
        id: number;
        name: string;
    };
    recipes?: RecipeItem[];
}

interface RecipeTableProps {
    products: ProductRecipeData[];
    onEditRecipe: (product: ProductRecipeData) => void;
}

export default function RecipeTable({ products, onEditRecipe }: RecipeTableProps) {
    // Calculate COGS (Cost of Goods Sold) for a product
    const calculateCOGS = (product: ProductRecipeData) => {
        if (!product.recipes || product.recipes.length === 0) return 0;
        return product.recipes.reduce((sum, item) => {
            const cost = item.ingredient ? Number(item.ingredient.cost_price) : 0;
            return sum + item.amount * cost;
        }, 0);
    };

    const formatCurrency = (val: number) => {
        return Number(val).toLocaleString('vi-VN') + ' đ';
    };

    const columns: DataTableColumn<ProductRecipeData>[] = [
        {
            key: 'image',
            header: 'Ảnh',
            hideWhenCompact: true,
            className: 'w-20',
            render: (product) => (
                <div className="w-10 h-10 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    {product.image ? (
                        <img src={cdnAsset(product.image, { w: 96, format: 'webp' })} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                        <ImageIcon className="w-5 h-5 text-zinc-400 stroke-[1.5]" />
                    )}
                </div>
            ),
        },
        {
            key: 'name',
            header: 'Sản phẩm',
            sortable: true,
            render: (product) => {
                const hasRecipes = product.recipes && product.recipes.length > 0;
                return (
                    <div>
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{product.name}</p>
                        <span className="text-xs text-zinc-400 tabular-nums">
                            {hasRecipes ? `${product.recipes!.length} thành phần định lượng` : 'Chưa thiết lập định lượng'}
                        </span>
                    </div>
                );
            },
        },
        {
            key: 'category',
            header: 'Danh mục',
            sortable: true,
            render: (product) => <span className="text-zinc-600 dark:text-zinc-400">{product.category?.name ?? '—'}</span>,
        },
        {
            key: 'price',
            header: 'Giá bán',
            sortable: true,
            align: 'right',
            render: (product) => <span className="font-medium text-zinc-900 dark:text-zinc-100 tabular-nums">{formatCurrency(product.price)}</span>,
        },
        {
            key: 'cogs',
            header: 'Giá vốn ước tính (COGS)',
            sortable: true,
            align: 'right',
            render: (product) => {
                const hasRecipes = product.recipes && product.recipes.length > 0;
                return hasRecipes
                    ? <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{formatCurrency(calculateCOGS(product))}</span>
                    : <span className="text-xs text-zinc-400">—</span>;
            },
        },
        {
            key: 'margin',
            header: 'Tỷ suất lợi nhuận',
            sortable: true,
            align: 'center',
            render: (product) => {
                const hasRecipes = product.recipes && product.recipes.length > 0;
                if (!hasRecipes) return <span className="text-xs text-zinc-400">Chưa tính</span>;
                const cogs = calculateCOGS(product);
                const marginPercent = product.price > 0
                    ? Math.round(((product.price - cogs) / product.price) * 100)
                    : 0;
                return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${
                        marginPercent >= 60
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : marginPercent >= 40
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                    }`}>
                        {marginPercent}% lợi nhuận
                    </span>
                );
            },
        },
        {
            key: 'actions',
            header: 'Thao tác',
            align: 'center',
            className: 'w-36',
            render: (product) => (
                <button
                    type="button"
                    onClick={() => onEditRecipe(product)}
                    className="px-3 py-1 text-xs font-semibold text-sky-700 bg-sky-50 dark:bg-sky-950 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900 flex items-center justify-center space-x-1 mx-auto transition-colors"
                >
                    <Edit3 className="w-3.5 h-3.5 stroke-[1.5]" />
                    <span>Cài công thức</span>
                </button>
            ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            rows={products}
            rowKey={(product) => product.id}
            defaultSortKey="name"
            getSortValue={(product, key) => {
                if (key === 'name') return product.name;
                if (key === 'category') return product.category?.name ?? '';
                if (key === 'price') return product.price;
                if (key === 'cogs') return calculateCOGS(product);
                if (key === 'margin') {
                    const cogs = calculateCOGS(product);
                    return product.price > 0 ? Math.round(((product.price - cogs) / product.price) * 100) : 0;
                }
                return String(product[key as keyof ProductRecipeData] ?? '');
            }}
            emptyMessage="Không tìm thấy định lượng"
        />
    );
}
