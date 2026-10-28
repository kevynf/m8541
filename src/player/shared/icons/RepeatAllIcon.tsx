import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export default function RepeatAllIcon({
  className,
  "aria-hidden": ariaHidden,
  ...props
}: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="15"
      viewBox="0 0 18 15"
      className={className}
      aria-hidden={ariaHidden}
      {...props}
    >
      <path
        d="M24.851-6.64v-3.324H14.294q-.883 0-1.655.3a4.2 4.2 0 0 0-1.347.831 3.8 3.8 0 0 0-.906 1.272 3.9 3.9 0 0 0-.33 1.61q0 .689.277 1.378.277.688.682 1.213L7.062-.141a8.7 8.7 0 0 1-1.565-2.613 8.6 8.6 0 0 1-.562-3.092q0-1.841.697-3.452a8.92 8.92 0 0 1 4.694-4.716 8.5 8.5 0 0 1 3.414-.697h11.111v-3.533l7.232 5.944zm-9.554 2.771V-.56h10.572q.868 0 1.647-.292a4 4 0 0 0 1.348-.824q.569-.53.906-1.273a3.9 3.9 0 0 0 .337-1.624q0-.689-.277-1.355a5.5 5.5 0 0 0-.697-1.221l3.968-3.219a8.6 8.6 0 0 1 2.127 5.705 8.6 8.6 0 0 1-.697 3.451 8.9 8.9 0 0 1-1.894 2.808 9 9 0 0 1-2.8 1.894 8.5 8.5 0 0 1-3.414.697H15.297v3.548L8.08 1.791z"
        style={{ fillRule: "nonzero" }}
        transform="translate(-2.83 10.464)scale(.57352)"
      />
    </svg>
  );
}
