import { useLayoutEffect, useState } from "react";

export function useViewportFit() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!element) return;
    let active = true;
    const update = () => {
      if (!active || !element.getBoundingClientRect().width) return;
      const top = element.getBoundingClientRect().top + window.scrollY;
      const height = Math.max(280, Math.floor(window.innerHeight - top - 20));
      element.style.setProperty("--viewport-space", `${height}px`);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(document.body);
    window.addEventListener("resize", update);
    document.fonts?.ready.then(update);
    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [element]);

  return setElement;
}
