import { useEffect, useState } from 'react';

/** mount 之後才變 true：預渲染與 hydration 首輪一律 false，讓 server 與 client 首輪 render 同形 */
export function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    return mounted;
}
