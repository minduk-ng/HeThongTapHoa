import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';

interface Daily { date: string; usage_count: number; revenue: number; }
interface TypeItem { type: string; count: number; percent: number; }

const COLORS = ['#0059bb', '#008730', '#e6a700'];

export default function PromotionAnalyticsCharts({ daily, types }: { daily: Daily[]; types: TypeItem[] }) {
    const typeLabels: Record<string, string> = { promotion: 'Promotion', coupon: 'Coupon', voucher: 'Voucher' };
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Doanh thu &amp; Số lượt dùng theo ngày</h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={daily}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="#0059bb" fill="#0059bb" fillOpacity={0.15} />
                            <Area type="monotone" dataKey="usage_count" name="Lượt dùng" stroke="#008730" fill="#008730" fillOpacity={0.15} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div className="lg:col-span-4 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Tỷ lệ sử dụng</h3>
                <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={types} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={80} label={({ percent = 0 }) => `${Number(percent).toFixed(0)}%`}>
                                {types.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend formatter={(value) => typeLabels[value] || value} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
