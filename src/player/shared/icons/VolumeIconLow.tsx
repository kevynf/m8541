import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export default function VolumeIconLow(props: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="16" viewBox="0 0 10 16" {...props}>
      <path d="M9.476 16V0L4.307 4.495a.25.25 0 0 1-.168.073L0 4.555v6.924l4.138-.014a.24.24 0 0 1 .168.063z" />
    </svg>
  );
}
