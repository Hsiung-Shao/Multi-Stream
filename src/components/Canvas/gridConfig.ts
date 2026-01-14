/**
 * Grid configuration and utilities for SimpleCanvas
 * 24x24 grid system that perfectly fits the browser viewport
 */

export const GRID_COLS = 24;
export const GRID_ROWS = 24;

export interface GridConfig {
    cols: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
    containerWidth: number;
    containerHeight: number;
}

/**
 * Calculate grid dimensions to perfectly fit the viewport
 * No extra space - exact 24x24 fit
 */
export function calculateGridConfig(
    viewportWidth: number,
    viewportHeight: number,
    totalRows: number = GRID_ROWS
): GridConfig {
    const cellWidth = viewportWidth / GRID_COLS;
    // Cell Height is based on VIEWPORT height divided by DEFAULT 24 rows?
    // OR should cell height remain constant based on Viewport/24, and container height grows?
    // Requirement: "24x24 grid that perfectly fits the viewport".
    // So 1 unit height = viewportHeight / 24.
    // If we have 36 rows, container height = (viewportHeight / 24) * 36.

    const cellHeight = viewportHeight / GRID_ROWS; // Base cell height derived from 24-row fit

    return {
        cols: GRID_COLS,
        rows: totalRows,
        cellWidth,
        cellHeight,
        containerWidth: viewportWidth,
        containerHeight: cellHeight * totalRows // Dynamic height
    };
}

/**
 * Snap a pixel value to the nearest grid cell
 */
export function snapToGrid(value: number, cellSize: number): number {
    return Math.round(value / cellSize) * cellSize;
}

/**
 * Convert pixel position to grid units
 */
export function pixelToGrid(px: number, cellSize: number): number {
    return Math.round(px / cellSize);
}

/**
 * Convert grid units to pixel position
 */
export function gridToPixel(gridUnits: number, cellSize: number): number {
    return gridUnits * cellSize;
}

/**
 * Clamp a value within grid bounds
 */
export function clampToGridBounds(
    value: number,
    size: number,
    maxCells: number,
    cellSize: number
): number {
    const minPx = 0;
    const maxPx = (maxCells * cellSize) - size;
    return Math.max(minPx, Math.min(value, maxPx));
}

/**
 * Window position and size in grid units
 */
export interface GridPosition {
    gridX: number;
    gridY: number;
    gridW: number;
    gridH: number;
}

/**
 * Window position and size in pixels  
 */
export interface PixelPosition {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Convert grid position to pixel position
 */
export function gridToPixelPosition(
    pos: GridPosition,
    config: GridConfig
): PixelPosition {
    return {
        x: pos.gridX * config.cellWidth,
        y: pos.gridY * config.cellHeight,
        width: pos.gridW * config.cellWidth,
        height: pos.gridH * config.cellHeight
    };
}

/**
 * Convert pixel position to grid position
 */
export function pixelToGridPosition(
    pos: PixelPosition,
    config: GridConfig
): GridPosition {
    return {
        gridX: Math.round(pos.x / config.cellWidth),
        gridY: Math.round(pos.y / config.cellHeight),
        gridW: Math.round(pos.width / config.cellWidth),
        gridH: Math.round(pos.height / config.cellHeight)
    };
}
