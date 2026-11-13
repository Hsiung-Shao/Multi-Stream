import "./index.css";
import { willHydratePrerender } from "./bootGate";

// 會 hydrate 的預渲染頁等瀏覽器回報首次內容繪製（FCP）後才下載、執行主程式：預渲染 HTML 不需要 JS 就畫得出來，
// 而 FCP 前下載完或執行完的 script 會被 Lighthouse 算進 FCP／LCP（預渲染頁的 modulepreload 也因此由 prerender.mjs 拿掉）。
// 空殼頁（/canvas 等）與語言／主題不符、反正要整頁重畫的人直接啟動。
let started = false;
const boot = () => {
  if (started) return;
  started = true;
  void import("./boot");
};
const readUser = () => {
  try {
    return {
      theme: JSON.parse(localStorage.getItem("userSettings") || "{}").theme ?? null,
      lng: localStorage.getItem("i18nextLng"),
      navLang: navigator.language || "en",
    };
  } catch {
    return null; // 儲存被封鎖：預判不了，直接啟動
  }
};
const user = readUser();
if (user && willHydratePrerender(document.documentElement.dataset, user) && PerformanceObserver.supportedEntryTypes?.includes("paint")) {
  new PerformanceObserver((list, observer) => {
    if (!list.getEntriesByName("first-contentful-paint").length) return;
    observer.disconnect();
    boot();
  }).observe({ type: "paint", buffered: true });
  setTimeout(boot, 3000); // 保底：背景分頁不繪製、或 FCP 遲遲不來
} else {
  boot();
}
