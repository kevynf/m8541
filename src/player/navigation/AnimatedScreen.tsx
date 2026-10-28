import { useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";

interface AnimatedScreenProps {
  navigationId: number;
  isNavigatingBack: boolean;
  snapshotRef: RefObject<string>;
  children?: ReactNode;
}

export default function AnimatedScreen({
  navigationId,
  isNavigatingBack,
  snapshotRef,
  children,
}: AnimatedScreenProps) {
  const nodeRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    const parent = node?.parentElement;
    const width = parent?.clientWidth ?? 0;
    if (!node || !parent) return undefined;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return undefined;
    }
    const previousMarkup = snapshotRef.current;
    snapshotRef.current = "";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (width === 0 || reduced || !previousMarkup) return undefined;

    const rtl = node.matches(":dir(rtl)");
    const direction = isNavigatingBack === rtl ? 1 : -1;
    const incomingFrom = direction * width;
    const outgoingTo = -direction * width;
    const outgoing = document.createElement("div");
    outgoing.className = "screen screen-exit-clone";
    outgoing.setAttribute("aria-hidden", "true");
    outgoing.inert = true;
    outgoing.style.pointerEvents = "none";
    outgoing.innerHTML = previousMarkup;
    outgoing.style.transform = "translateX(0)";
    outgoing.style.transition = "none";
    parent.append(outgoing);

    node.style.transform = `translateX(${incomingFrom}px)`;
    node.style.transition = "none";
    const frame = requestAnimationFrame(() => {
      if (!node.isConnected || !outgoing.isConnected) return;
      node.style.transition = "transform 240ms cubic-bezier(0.37, 0, 0.63, 1)";
      outgoing.style.transition = "transform 240ms cubic-bezier(0.37, 0, 0.63, 1)";
      node.style.transform = "translateX(0)";
      outgoing.style.transform = `translateX(${outgoingTo}px)`;
    });
    const removeOutgoing = () => outgoing.remove();
    outgoing.addEventListener("transitionend", removeOutgoing, { once: true });
    const timeout = setTimeout(removeOutgoing, 280);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      outgoing.remove();
      node.style.removeProperty("transform");
      node.style.removeProperty("transition");
    };
  }, [navigationId]);

  return (
    <div ref={nodeRef} className="screen" data-testid="screen">
      {children}
    </div>
  );
}
