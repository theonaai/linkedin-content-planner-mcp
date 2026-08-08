// Generic outline icons in the spirit of LinkedIn's action row — not a copy of their
// trademarked glyphs, just the same recognizable shapes (thumb, bubble, share, plane).
import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    />
  );
}

export function ThumbsUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M7 22H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l4.2-7.3a1.4 1.4 0 0 1 2.6.9L12.8 10H19a2 2 0 0 1 2 2.3l-1.3 7.5a2 2 0 0 1-2 1.7H7" />
    </Icon>
  );
}

export function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M4 4.5h16v12H8.5L4 20.5z" />
    </Icon>
  );
}

export function RepostIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M6 8h11.5L14.5 5" />
      <path d="M18 16H6.5L9.5 19" />
    </Icon>
  );
}

export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M21 3 3 10.2l7 2.6 2.6 7z" />
    </Icon>
  );
}

export function GlobeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props} strokeWidth={1.4}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 4 5.3 4 8.5s-1.4 6.1-4 8.5c-2.6-2.4-4-5.3-4-8.5s1.4-6.1 4-8.5Z" />
    </Icon>
  );
}

export function UserAvatarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <circle cx="12" cy="8.5" r="4" />
      <path d="M4 20.5c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </svg>
  );
}
