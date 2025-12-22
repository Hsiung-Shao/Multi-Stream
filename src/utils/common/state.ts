/**
 * 全域狀態管理
 * 對應 legacy: js/utils.js - isDraggingStreamBox
 */

let _isDraggingStreamBox = false;

export const GlobalState = {
    /**
     * 獲取拖曳狀態
     */
    get isDraggingStreamBox() {
        return _isDraggingStreamBox;
    },

    /**
     * 設定拖曳狀態
     */
    set isDraggingStreamBox(value: boolean) {
        _isDraggingStreamBox = value;
    }
};

/**
 * getter for direct usage
 */
export function getIsDraggingStreamBox(): boolean {
    return _isDraggingStreamBox;
}

/**
 * setter for direct usage
 */
export function setIsDraggingStreamBox(value: boolean): void {
    _isDraggingStreamBox = value;
}
