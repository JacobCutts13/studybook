// Icons drawn for studybook: a 24px grid with 2px rounded strokes, coloured
// by the text around them.

type IconProps = { size?: number };

function Icon({
  size = 18,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function BookIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 6.5C10.4 5.3 8 4.75 4 4.75v13c4 0 6.4.55 8 1.75 1.6-1.2 4-1.75 8-1.75v-13c-4 0-6.4.55-8 1.75Z" />
      <path d="M12 6.5v13" />
    </Icon>
  );
}
