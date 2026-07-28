"use client";

import { createElement, useState, type CSSProperties, type ReactNode } from "react";

type El = "button" | "a" | "div" | "span";

export function Hover({
  as = "div", base, hover, onClick, href, target, rel, children, disabled, title, ariaLabel, className,
}: {
  as?: El;
  base: CSSProperties;
  hover?: CSSProperties;
  onClick?: () => void;
  href?: string;
  target?: string;
  rel?: string;
  children?: ReactNode;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [h, setH] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: any = {
    style: h && hover ? { ...base, ...hover } : base,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    className,
    title,
    "aria-label": ariaLabel,
  };
  if (onClick) props.onClick = onClick;
  if (as === "a") { props.href = href; props.target = target; props.rel = rel; }
  if (as === "button") { props.disabled = disabled; props.type = "button"; }
  return createElement(as, props, children);
}
