import "./index.css";

// 預渲染頁等瀏覽器回報首次內容繪製（FCP）後才執行主程式：預渲染 HTML 不需要 JS 就畫得出來，
// 而 FCP 前執行完的 JS 會被 Lighthouse 算進 FCP／LCP（模擬慢速網路時每 KB 都要錢）。下載不受影響（modulepreload）。
// 沒預渲染的頁（/canvas 等空殼）畫面全靠 JS，直接啟動。
let started = false;
const boot = () => {
  if (started) return;
  started = true;
  void import("./boot");
};
if (document.documentElement.dataset.prerenderLang && PerformanceObserver.supportedEntryTypes?.includes("paint")) {
  new PerformanceObserver((list, observer) => {
    if (!list.getEntriesByName("first-contentful-paint").length) return;
    observer.disconnect();
    boot();
  }).observe({ type: "paint", buffered: true });
  setTimeout(boot, 3000); // 保底：背景分頁不繪製、或 FCP 遲遲不來
} else {
  boot();
}
