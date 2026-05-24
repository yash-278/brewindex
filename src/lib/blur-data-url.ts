/**
 * Dark blur placeholder for icon slots.
 * #1a1a1a matches --color-surface from the UI-SPEC design tokens.
 * Used as blurDataURL in next/image placeholder="blur".
 */
const svgPlaceholder =
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#1a1a1a"/></svg>';

export const DARK_BLUR_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(svgPlaceholder).toString('base64')}`;
