/** Shared brand constants used by metadata image routes (favicon, apple icon, OG image). */

export const BRAND_BG = "#121212";
export const BRAND_FG = "#F0F0F0";
export const BRAND_ACCENT = "#2AA286";

/** The Acta logomark path, drawn on a 32.0478 x 32 viewBox. */
export const LOGOMARK_PATH =
  "M32.0478 21.76C32.0478 27.4154 27.4563 32 21.7925 32H16.0239V22.2745H21.0511V26.9805H21.8932C24.7251 26.9804 27.0208 24.6881 27.0208 21.8605V17.28H32.0478V21.76ZM3.20477 17.2793C8.86856 17.2793 13.46 21.8639 13.46 27.5193V31.9994H8.43302V27.3945C8.433 24.5668 6.13724 22.2746 3.30535 22.2746H0V17.2793H3.20477ZM23.6149 4.6055C23.6149 7.43318 25.9106 9.72543 28.7425 9.72543H32.0478V14.7207H28.843C23.1792 14.7207 18.5878 10.1361 18.5878 4.48071V0.000646552H23.6149V4.6055ZM16.0239 9.72554H10.9969V5.0195H10.1548C7.32286 5.01952 5.0272 7.31186 5.0272 10.1395V14.72H0.000107919V10.24C0.000122444 4.58462 4.59156 3.57012e-05 10.2553 0H16.0239V9.72554Z";

/** Standalone logomark as a data URI, sized to `size` px, for use in `<img>` inside ImageResponse. */
export function logomarkDataUri(size: number, fill: string = BRAND_FG): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32.0478 32"><path d="${LOGOMARK_PATH}" fill="${fill}"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
