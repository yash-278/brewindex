/**
 * Dark blur placeholder for icon slots.
 * #1a1a1a matches --color-surface from the UI-SPEC design tokens.
 * Used as blurDataURL in next/image placeholder="blur".
 *
 * Pre-computed constant — avoids Buffer.from() at module load time so this
 * module is safe in the Vercel Edge Runtime where Buffer is not available.
 * Source SVG:
 *   <svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">
 *     <rect width="8" height="8" fill="#1a1a1a"/>
 *   </svg>
 */
export const DARK_BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxYTFhMWEiLz48L3N2Zz4=';
