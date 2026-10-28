import { useLayoutEffect, useRef } from "react";
import { settings as settingsStore } from "../settings/store.ts";
import { createI18n } from "../i18n.ts";
import type { I18n } from "../i18n.ts";
import { useStore } from "../shared/use-store.ts";
import type { MenuItem } from "./menu.ts";

const toggleKeys: Record<string, string> = {
  off: "ASE.Web.M8541.Settings.Value.Off",
  on: "ASE.Web.M8541.Settings.Value.On",
  songs: "ASE.Web.M8541.Settings.Value.Songs",
  one: "ASE.Web.M8541.Settings.Value.One",
  all: "ASE.Web.M8541.Settings.Value.All",
};

interface MenuListProps {
  items: readonly MenuItem[];
  selectedIndex: number;
  navigationId: number;
  shouldFocus: boolean;
  restoredScrollTop?: number;
  onListMount?: (node: HTMLUListElement) => void;
  onListUnmount?: (node: HTMLUListElement) => void;
  i18n?: I18n;
}

export default function MenuList({
  items,
  selectedIndex,
  navigationId,
  shouldFocus,
  restoredScrollTop,
  onListMount,
  onListUnmount,
  i18n,
}: MenuListProps) {
  const settings = useStore(settingsStore);
  const listRef = useRef<HTMLUListElement | null>(null);
  const fallbackI18n = useRef<I18n | null>(null);
  const currentI18n = i18n ?? fallbackI18n.current ?? createI18n();
  fallbackI18n.current = currentI18n;

  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return undefined;
    if (shouldFocus) node.focus({ preventScroll: true });
    if (restoredScrollTop !== undefined) node.scrollTop = restoredScrollTop;
    const selected = node.querySelector(`#menu-item-${navigationId}-${selectedIndex}`);
    selected?.scrollIntoView({ block: "nearest" });
    return undefined;
  }, [navigationId, restoredScrollTop, selectedIndex, shouldFocus]);

  function setListRef(node: HTMLUListElement | null) {
    if (listRef.current === node) return;
    if (listRef.current) onListUnmount?.(listRef.current);
    listRef.current = node;
    if (node) onListMount?.(node);
  }

  function toggleValue(value: string) {
    const key = toggleKeys[value];
    return key ? currentI18n.t(key) : value;
  }

  return (
    <ul
      ref={setListRef}
      className="menu-items"
      data-testid="menu-items"
      role="listbox"
      tabIndex={0}
      aria-activedescendant={`menu-item-${navigationId}-${selectedIndex}`}
      aria-labelledby="menu-title"
    >
      {items.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        const isInfo = item.action === "info";
        return (
          <li
            key={item.id}
            id={`menu-item-${navigationId}-${idx}`}
            className={`menu-item${isSelected ? " selected" : ""}${
              isInfo && item.centered ? " centered" : ""
            }`}
            data-testid="menu-item"
            data-action={item.action}
            role={isInfo ? undefined : "option"}
            aria-selected={isInfo ? undefined : isSelected}
          >
            <span className="item-title" data-testid="item-title" dir="auto">
              {item.title}
            </span>{" "}
            {isInfo && item.value ? (
              <span className="item-value" data-testid="item-value" dir="auto">
                {item.value}
              </span>
            ) : item.action === "inline-toggle" ? (
              <span className="item-value" data-testid="item-value" dir="auto">
                {toggleValue(settings[item.toggleKey])}
              </span>
            ) : item.action === "navigate" ? (
              <span className="chevron" data-testid="chevron" aria-hidden="true" />
            ) : null}{" "}
          </li>
        );
      })}
    </ul>
  );
}
