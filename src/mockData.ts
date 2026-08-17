import type { StoragePlan } from './types';

const BASE_PRICE = 25000; // VNĐ/tháng gốc, gói 1 tháng

export const storagePlans: StoragePlan[] = [
  {
    id: 'plan-1m',
    durationMonths: 1,
    label: '1 tháng',
    storageGB: 100,
    pricePerMonth: BASE_PRICE,
    originalPricePerMonth: BASE_PRICE,
    totalPrice: BASE_PRICE * 1,
    discountPercent: 0,
  },
  {
    id: 'plan-3m',
    durationMonths: 3,
    label: '3 tháng',
    storageGB: 100,
    pricePerMonth: Math.round(BASE_PRICE * 0.9),
    originalPricePerMonth: BASE_PRICE,
    totalPrice: Math.round(BASE_PRICE * 0.9) * 3,
    discountPercent: 10,
  },
  {
    id: 'plan-6m',
    durationMonths: 6,
    label: '6 tháng',
    storageGB: 200,
    pricePerMonth: Math.round(BASE_PRICE * 0.8),
    originalPricePerMonth: BASE_PRICE,
    totalPrice: Math.round(BASE_PRICE * 0.8) * 6,
    discountPercent: 20,
    badge: 'Phổ biến nhất',
  },
  {
    id: 'plan-12m',
    durationMonths: 12,
    label: '12 tháng',
    storageGB: 200,
    pricePerMonth: Math.round(BASE_PRICE * 0.65),
    originalPricePerMonth: BASE_PRICE,
    totalPrice: Math.round(BASE_PRICE * 0.65) * 12,
    discountPercent: 35,
    badge: 'Tiết kiệm nhất',
  },
];
