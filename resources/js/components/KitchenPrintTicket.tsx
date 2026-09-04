import React from 'react';

interface KitchenPrintTicketProps {
    orderNumber: string;
    tableNumber: string;
    items: Array<{ name: string; quantity: number; note?: string | null }>;
    note?: string | null;
    createdAtLabel: string;
}

export default function KitchenPrintTicket({ orderNumber, tableNumber, items, note, createdAtLabel }: KitchenPrintTicketProps) {
    return (
        <div className="print-area print-ticket font-mono text-[10px]">
            <div className="text-center font-bold mb-1">TẠP HOÁ / QUÁN</div>
            <div>----------------------------</div>
            <div>BẾP · Ticket: {orderNumber}</div>
            <div>Bàn: {tableNumber}</div>
            <div>Giờ: {createdAtLabel}</div>
            <div>----------------------------</div>
            {items.map((item, idx) => (
                <div key={idx} className="flex justify-between">
                    <span>{item.quantity}× {item.name}</span>
                </div>
            ))}
            {items.map((item, idx) => item.note ? (
                <div key={`n${idx}`} className="text-amber-700 italic">  → Ghi chú: {item.note}</div>
            ) : null)}
            {note && <div className="italic">Ghi chú order: {note}</div>}
            <div>----------------------------</div>
            <div className="text-center">Cảm ơn!</div>
        </div>
    );
}
