/**
 * Fullscreen Utilities - Handles cross-browser fullscreen API with vendor prefixes
 */

export interface FullscreenElement extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
}

export interface FullscreenDocument extends Document {
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
    webkitFullscreenElement?: Element;
    mozFullScreenElement?: Element;
    msFullscreenElement?: Element;
}

/**
 * Request fullscreen for an element
 */
export const requestFullscreen = async (element: FullscreenElement): Promise<void> => {
    if (element.requestFullscreen) {
        return element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
        return element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
        return element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
        return element.msRequestFullscreen();
    }
    return Promise.reject(new Error('Fullscreen API not supported'));
};

/**
 * Exit fullscreen
 */
export const exitFullscreen = async (): Promise<void> => {
    const doc = document as FullscreenDocument;
    if (doc.exitFullscreen) {
        return doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
        return doc.webkitExitFullscreen();
    } else if (doc.mozCancelFullScreen) {
        return doc.mozCancelFullScreen();
    } else if (doc.msExitFullscreen) {
        return doc.msExitFullscreen();
    }
    return Promise.reject(new Error('Fullscreen API not supported'));
};

/**
 * Get the current fullscreen element
 */
export const getFullscreenElement = (): Element | null => {
    const doc = document as FullscreenDocument;
    return (
        doc.fullscreenElement ||
        doc.webkitFullscreenElement ||
        doc.mozFullScreenElement ||
        doc.msFullscreenElement ||
        null
    );
};

/**
 * Check if the document is in fullscreen mode
 */
export const isFullscreenEnabled = (): boolean => {
    return !!getFullscreenElement();
};

/**
 * Subscribe to fullscreen change events
 */
export const onFullscreenChange = (callback: () => void): (() => void) => {
    const events = [
        'fullscreenchange',
        'webkitfullscreenchange',
        'mozfullscreenchange',
        'MSFullscreenChange'
    ];

    events.forEach(event => document.addEventListener(event, callback));

    return () => {
        events.forEach(event => document.removeEventListener(event, callback));
    };
};
