/**
 * Grid Utilities
 * Handles calculations for the 24x24 grid system.
 */

export interface GridDimensions {
    colWidth: number;
    rowHeight: number;
    containerWidth: number;
}

/**
 * Calculates the grid dimensions based on the window size.
 * Enforces a 24-column grid.
 * 
 * @param windowWidth Current window width
 * @param windowHeight Current window height
 * @param cols Number of columns (default 24)
 * @returns GridDimensions
 */
export const calculateGridDimensions = (
    windowWidth: number,
    windowHeight: number,
    cols: number = 24
): GridDimensions => {
    const colWidth = Math.floor(windowWidth / cols);

    // Snap container width to exact multiple of colWidth to prevent subpixel issues
    const containerWidth = colWidth * cols;

    // Use window height divided by 24 for row height
    // This maintains the logical grid system relative to the screen
    const rowHeight = Math.floor(windowHeight / 24);

    return {
        colWidth,
        rowHeight,
        containerWidth
    };
};

/**
 * Generates the CSS background style for the visual grid.
 */
export const getGridBackgroundStyle = (
    colWidth: number,
    rowHeight: number,
    containerWidth: number
): React.CSSProperties => {
    const bgSizeW = colWidth || 40;
    const bgSizeH = Math.max(rowHeight || 40, 10); // Safeguard

    return {
        width: `${containerWidth}px`,
        backgroundSize: `${bgSizeW}px ${bgSizeH}px`,
        backgroundImage: `
          linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
      `
    };
};
