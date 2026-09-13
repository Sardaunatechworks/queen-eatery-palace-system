/**
 * Queen's Palace Eatery & Event Hall - Reusable Pricing Service
 *
 * Centralizes takeaway packaging calculations and settings retrieval.
 * Reusable across Cashier POS, Customer Online Orders, Paystack, and Receipts.
 */

import { apiClient } from '../lib/apiClient';
import type { ApiResponse } from '../types';

export interface PricingSettingsResponse {
  takeaway_pack_price: number;
  currency: string;
  symbol: string;
}

// In-memory cache for fast UI feedback
let cachedPackPrice: number | null = null;
const DEFAULT_PACK_PRICE = 300;

/**
 * Fetch the current takeaway pack unit price from backend settings.
 * Caches result in-memory for synchronous responsiveness.
 */
export async function getTakeawayPackPrice(): Promise<number> {
  try {
    const res = await apiClient.get<ApiResponse<PricingSettingsResponse>>('/settings/pricing');
    if (res.success && res.data && typeof res.data.takeaway_pack_price === 'number') {
      cachedPackPrice = res.data.takeaway_pack_price;
      return cachedPackPrice;
    }
  } catch (error) {
    console.warn('Failed to fetch pricing settings, falling back to default:', error);
  }
  return cachedPackPrice ?? DEFAULT_PACK_PRICE;
}

/**
 * Synchronous getter for current cached pack price (falls back to 300).
 */
export function getCachedPackPrice(): number {
  return cachedPackPrice ?? DEFAULT_PACK_PRICE;
}

/**
 * Update the takeaway pack unit price (Admin only).
 */
export async function updateTakeawayPackPrice(newPrice: number): Promise<number> {
  const res = await apiClient.patch<ApiResponse<{ takeaway_pack_price: number }>>('/settings/pricing', {
    takeaway_pack_price: newPrice,
  });

  if (res.success && res.data && typeof res.data.takeaway_pack_price === 'number') {
    cachedPackPrice = res.data.takeaway_pack_price;
    return cachedPackPrice;
  }
  throw new Error(res.message || 'Failed to update takeaway pack price');
}

/**
 * Calculate packaging fee: quantity × unitPrice.
 */
export function calculatePackagingFee(quantity: number, unitPrice: number): number {
  const q = Math.max(0, quantity);
  const p = Math.max(0, unitPrice);
  return Math.round(q * p * 100) / 100;
}

/**
 * Calculate packaging quantity for online customer orders.
 * Only counts items where requires_packaging is true (default true).
 * Non-packaging items like bottled drinks/water are excluded.
 */
export function calculatePackagingQuantity(
  cart: Array<{ item: { requires_packaging?: boolean }; quantity: number }>
): number {
  return cart.reduce((total, cartItem) => {
    // If requires_packaging is explicitly false, do not count it
    const requiresPackaging = cartItem.item.requires_packaging !== false;
    return requiresPackaging ? total + Math.max(0, cartItem.quantity) : total;
  }, 0);
}

/**
 * Calculate grand total.
 */
export function calculateGrandTotal(
  subtotal: number,
  packagingFee: number,
  deliveryFee: number = 0,
  discountAmount: number = 0
): number {
  const total = subtotal + packagingFee + deliveryFee - discountAmount;
  return Math.max(0, Math.round(total * 100) / 100);
}
