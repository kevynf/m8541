import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export default function MenuIcon({ className, "aria-hidden": ariaHidden, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="400"
      height="150"
      viewBox="0 0 400 150"
      className={className}
      aria-hidden={ariaHidden}
      {...props}
    >
      <path
        id="menu-text-curve"
        fill="none"
        stroke="none"
        d="M31.234 97.495S92.808 41.234 200 41.234c121.84 0 168.766 56.26 168.766 56.26"
      />
      <text>
        <textPath xlinkHref="#menu-text-curve" startOffset="112">
          menu
        </textPath>
      </text>
    </svg>
  );
}
