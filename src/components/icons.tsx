import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function Base(props: IconProps) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const CalendarIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4.5" width="18" height="16.5" rx="2.5" />
    <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
  </Base>
);

export const RepeatIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M3.5 11.5V10a4 4 0 0 1 4-4h13" />
    <path d="M7 21.5 3.5 18 7 14.5" />
    <path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" />
  </Base>
);

export const CheckSquareIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3" />
    <path d="m8 12 3 3 5-6" />
  </Base>
);

export const TargetIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Base>
);

export const SettingsIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Base>
);

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 5v14M5 12h14" />
  </Base>
);

export const ChevronLeftIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m15 6-6 6 6 6" />
  </Base>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m9 6 6 6-6 6" />
  </Base>
);

export const XIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);

export const CheckIcon = (p: IconProps) => (
  <Base strokeWidth={2.5} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);

export const FilterIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 5h16l-6 7.5V19l-4-2v-4.5z" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);

export const PanelIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="M15 4v16" />
  </Base>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="m6 9 6 6 6-6" />
  </Base>
);

export const MoreIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="5.5" cy="12" r="1" fill="currentColor" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1" fill="currentColor" />
  </Base>
);

export const HashIcon =(p: IconProps) => (
  <Base {...p}>
    <path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18" />
  </Base>
);
