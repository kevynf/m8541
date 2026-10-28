import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export default function PauseIcon({ className, "aria-hidden": ariaHidden, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="20"
      viewBox="0 0 14 20"
      className={className}
      aria-hidden={ariaHidden}
      {...props}
    >
      <path
        d="M6.576-95.378h21.875V0H6.576zm42.578 0h21.94V0h-21.94z"
        transform="translate(-1.379 20)scale(.2097)"
        style={{ fillRule: "nonzero" }}
      />
    </svg>
  );
}
