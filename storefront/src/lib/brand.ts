import { resolveBrandKey, STORE_BRANDS, type BrandKey, type StoreBrand } from './brands';

/** The brand this build was made for (BRAND at build time, inlined by Vite; plan DD6). Server only, see brands.ts. */
export const BRAND: BrandKey = resolveBrandKey(import.meta.env.BRAND);
export const brand: StoreBrand = STORE_BRANDS[BRAND];
