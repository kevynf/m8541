import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export default function PlayIcon({ className, "aria-hidden": ariaHidden, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="20"
      viewBox="0 0 17 20"
      className={className}
      aria-hidden={ariaHidden}
      {...props}
    >
      <path
        d="M71.234-28.693 10.883 7.049v-71.533z"
        transform="translate(-3.043 18.03)scale(.27959)"
        style={{ fillRule: "nonzero" }}
      />
    </svg>
  );
}
