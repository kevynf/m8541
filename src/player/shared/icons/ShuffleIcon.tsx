import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export default function ShuffleIcon({ className, "aria-hidden": ariaHidden, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="15"
      viewBox="0 0 20 15"
      className={className}
      aria-hidden={ariaHidden}
      {...props}
    >
      <path
        d="M.935-.347v-.111H.812a.1.1 0 0 0-.03.007.1.1 0 0 0-.026.02l-.252.314a1 1 0 0 1-.066.058l-.032.022-.035.019-.036.013A.2.2 0 0 1 .299 0h-.25v-.165h.25a.1.1 0 0 0 .037-.011.3.3 0 0 0 .073-.061L.68-.572l.017-.015.026-.017a.1.1 0 0 1 .035-.014.2.2 0 0 1 .044-.006h.133v-.109l.222.192zM.299-.624q.018 0 .036.006a.4.4 0 0 1 .11.064 1 1 0 0 1 .075.069l-.095.118L.38-.413.36-.429.339-.444.318-.455.299-.458h-.25v-.166zm.636.735V0H.802a.2.2 0 0 1-.044-.005.2.2 0 0 1-.061-.03L.68-.051.608-.14l.095-.116.053.066.026.018a.1.1 0 0 0 .03.007h.123v-.11l.222.192z"
        style={{ fillRule: "nonzero" }}
        transform="translate(-.864 12.93)scale(17.6389)"
      />
    </svg>
  );
}
