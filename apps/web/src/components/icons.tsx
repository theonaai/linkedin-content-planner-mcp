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

// A generic terminal/CLI glyph representing a coding agent — deliberately not any specific
// vendor's mark (e.g. Claude Code's or Codex's actual logo), since those are trademarked and
// we have no license to reproduce them. This just reads as "command-line agent."
export function TerminalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7.5 9.5 10.5 12l-3 2.5" />
      <path d="M13 14.5h3.5" />
    </Icon>
  );
}

// Same reasoning as TerminalIcon — a generic code-braces glyph, not a copy of any vendor's mark.
export function BracesIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...props}>
      <path d="M9 4.5c-1.8 0-2.8.9-2.8 2.8v2.4c0 1.1-.9 2-2 2.3.9.3 2 1.2 2 2.3v2.4c0 1.9 1 2.8 2.8 2.8" />
      <path d="M15 4.5c1.8 0 2.8.9 2.8 2.8v2.4c0 1.1.9 2 2 2.3-.9.3-2 1.2-2 2.3v2.4c0 1.9-1 2.8-2.8 2.8" />
    </Icon>
  );
}

// A simplified version of the badge shape Theona's own login screen uses (dark rounded square,
// pale ring) — appropriate here since Theona is this app's own identity/auth partner, not an
// unaffiliated third party's trademark.
export function TheonaMarkIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" {...props}>
      <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" />
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="white" strokeWidth="2.2" />
    </svg>
  );
}

// GitHub's mark, used only as the conventional "this links to a GitHub repo" indicator — the
// same widely-used generic representation shown on virtually every open-source project's badges
// and link buttons, not a claim of affiliation with GitHub itself.
export function GitHubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.99 1.03-2.69-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.4 9.4 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.6 1.03 2.69 0 3.85-2.34 4.7-4.57 4.94.36.31.68.92.68 1.85v2.75c0 .26.18.58.69.48A10 10 0 0 0 12 2Z" />
    </svg>
  );
}
