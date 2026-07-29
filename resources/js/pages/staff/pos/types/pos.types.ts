export interface POSOrderItemData {
    id: number;
    menu_item_id: number;
    quantity: number;
    unit_price: number;
    status?: 'pending' | 'processing' | 'completed' | 'cancelled';
    served_at?: string | null;
    created_at?: string;
    note?: string;
    menu_item?: {
        name: string;
        vat_rate?: number;
    };
}

export interface POSOrderData {
    id: number;
    order_code?: string;
    status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'paid' | 'cancelled';
    items?: POSOrderItemData[];
}

export interface POSTableData {
    id: number;
    table_number: string;
    area?: string;
    capacity: number;
    status: 'available' | 'occupied' | 'reserved' | 'maintenance';
    merged_into_table_id?: number | null;
    merged_into_table?: POSTableData | null;
    reservation_time?: string | null;
    reservation_name?: string | null;
    reservation_phone?: string | null;
    reservation_note?: string | null;
    customer_name?: string;
    customer_phone?: string;
    active_order?: POSOrderData | null;
    active_orders?: POSOrderData[];
    deposit_amount?: number;
}

export interface CategoryData {
    id: number;
    name: string;
}

export interface POSProductData {
    id: number;
    category_id: number;
    name: string;
    price: number;
    vat_rate?: number;
    image?: string | null;
    image_url?: string;
    is_available: boolean;
    max_servings?: number;
}

export interface StagedReduction {
    orderItemId: number;
    menuItemId: number;
    reduceQuantity: number;
    reason: string;
    note?: string;
}

export interface CartItem {
    menu_item_id: number;
    name: string;
    quantity: number;
    initialQuantity?: number;
    unit_price: number;
    vat_rate: number;
    note?: string;
    isConfirmed?: boolean;
    isKitchenCompleted?: boolean;
    isServed?: boolean;
    orderStatus?: string;
    orderItemId?: number;
    orderCode?: string;
    sentAt?: string;
    stagedReduceQty?: number;
    stagedReason?: string;
    stagedNote?: string;
}

export interface ReceiptModalState {
    isOpen: boolean;
    paymentMethod: 'cash' | 'bank_transfer';
    amountReceived: number;
    changeAmount: number;
    cartItems: CartItem[];
    table: POSTableData | null;
    invoiceCode?: string;
}

export interface ServingItem {
    id: string;
    order_id: number;
    order_code: string;
    table_number: string;
    table_area: string;
    items: Array<{
        id: number;
        name: string;
        quantity: number;
        note?: string | null;
    }>;
    completed_at: string;
}

export interface POSManagerProps {
    tables: POSTableData[];
    categories: CategoryData[];
    products: POSProductData[];
}
