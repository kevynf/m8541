import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";

type StyleWithCustomProperties = CSSProperties & Record<`--${string}`, string | number>;

interface MarqueeProps {
  text: string;
  resetKey?: string | number;
}

export default function Marquee({ text, resetKey }: MarqueeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const copyRef = useRef<HTMLSpanElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [copyWidth, setCopyWidth] = useState(0);
  const scrolling = copyWidth - containerWidth > 1;
  const restartKey = `${resetKey ?? ""}\0${text}`;

  useLayoutEffect(() => {
    const container = containerRef.current;
    const copy = copyRef.current;
    if (!container || !copy) return undefined;

    const measureContainer = () => setContainerWidth(container.clientWidth);
    const measureCopy = () => setCopyWidth(copy.offsetWidth);
    const observer = new ResizeObserver(() => {
      measureContainer();
      measureCopy();
    });

    observer.observe(container);
    observer.observe(copy);
    measureContainer();
    measureCopy();
    return () => observer.disconnect();
  }, [restartKey]);

  const trackStyle: StyleWithCustomProperties = { "--marquee-copy-width": copyWidth };

  return (
    <div ref={containerRef} className={`marquee${scrolling ? " scrolling" : ""}`} dir="auto">
      <div key={restartKey} className="marquee-track" style={trackStyle}>
        <span ref={copyRef} className="marquee-copy">
          {text}
        </span>
        {scrolling ? (
          <span className="marquee-copy" aria-hidden="true">
            {text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
