import type React from "react";

export function AppLogo(): React.ReactElement {
  return (
    <svg className="app-logo-symbol" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path
        d="M16 20C16 15.5817 19.5817 12 24 12H46C50.4183 12 54 15.5817 54 20V42C54 46.4183 50.4183 50 46 50H24C19.5817 50 16 46.4183 16 42V20Z"
        fill="rgba(255,255,255,0.16)"
      />
      <path
        d="M10 28C10 22.4772 14.4772 18 20 18H40C45.5228 18 50 22.4772 50 28V44C50 49.5228 45.5228 54 40 54H20C14.4772 54 10 49.5228 10 44V28Z"
        fill="rgba(255,255,255,0.26)"
      />
      <path
        d="M22 31L28 36L22 41"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="4"
      />
      <path d="M33 42H43" stroke="white" strokeLinecap="round" strokeWidth="4" />
      <path
        d="M29 17V11M29 11H39M39 11V17"
        fill="none"
        stroke="rgba(255,255,255,0.76)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <path
        d="M13 31H7M7 31V40M7 40H13"
        fill="none"
        stroke="rgba(255,255,255,0.72)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <circle cx="39" cy="11" fill="white" r="3.5" />
      <circle cx="7" cy="40" fill="white" r="3.5" />
      <circle cx="49" cy="23" fill="white" r="3.5" />
    </svg>
  );
}
