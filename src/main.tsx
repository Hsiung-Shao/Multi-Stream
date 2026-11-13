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
const entryTypes = PerformanceObserver.supportedEntryTypes ?? [];
if (user && willHydratePrerender(document.documentElement.dataset, user) && entryTypes.includes("paint")) {
  setTimeout(boot, 3000); // 保底：背景分頁不繪製、或 FCP 遲遲不來
  // 除了 FCP，也等視窗內標了 elementtiming 的圖（首頁大圖＝LCP 元素）畫出來：LCP 常比 FCP 晚幾十毫秒，期間下載完的 script 一樣會被計入
  const pending = new Set(["first-contentful-paint"]);
  if (entryTypes.includes("element")) {
    document.querySelectorAll("img[elementtiming]").forEach((img) => {
      if (img.getBoundingClientRect().top < innerHeight) pending.add(img.getAttribute("elementtiming")!); // 視窗外的圖不會畫，等了只會落到保底
    });
  }
  const done = (key: string) => {
    if (pending.delete(key) && !pending.size) boot();
  };
  new PerformanceObserver((list) => list.getEntries().forEach((e) => done(e.name))).observe({ type: "paint", buffered: true });
  if (pending.size > 1) {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => done((e as PerformanceEntry & { identifier: string }).identifier))).observe({ type: "element", buffered: true });
  }
} else {
  boot();
}
