"use client";

import { Toaster as Sonner, ToasterProps } from "sonner";
import { useAppliedTheme } from "../../hooks/useAppliedTheme";

const Toaster = ({ ...props }: ToasterProps) => {
  // 跟隨 app 實際套用的主題(而非 OS 主題):
  // toast 背景吃 documentElement 的 --popover,文字色由 sonner 依 theme 決定,
  // 兩者來源必須一致,否則會出現深底配深字(對比不足)。
  const theme = useAppliedTheme();

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
