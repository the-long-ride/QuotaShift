import React from "react";

export const AddPlusIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const BestStarIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
    <path
      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

export const AntigravityCloudApiIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 12,
  className,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
  >
    <g id="SVGRepo_bgCarrier" strokeWidth="0" />
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
    <g id="SVGRepo_iconCarrier">
      <path
        d="M5.25589 16C3.8899 15.0291 3 13.4422 3 11.6493C3 9.20008 4.8 6.9375 7.5 6.5C8.34694 4.48637 10.3514 3 12.6893 3C15.684 3 18.1317 5.32251 18.3 8.25C19.8893 8.94488 21 10.6503 21 12.4969C21 14.0582 20.206 15.4339 19 16.2417M12 21V11M12 21L9 18M12 21L15 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

export const AntigravityWorkerSandboxIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 12,
  className,
}) => (
  <svg
    fill="currentColor"
    viewBox="0 0 1024 1024"
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
  >
    <g id="SVGRepo_bgCarrier" strokeWidth="0" />
    <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" />
    <g id="SVGRepo_iconCarrier">
      <path d="M709.6 210l.4-.2h.2L512 96 313.9 209.8h-.2l.7.3L151.5 304v416L512 928l360.5-208V304l-162.9-94zM482.7 843.6L339.6 761V621.4L210 547.8V372.9l272.7 157.3v313.4zM238.2 321.5l134.7-77.8 138.9 79.7 139.1-79.9 135.2 78-273.9 158-274-158zM814 548.3l-128.8 73.1v139.1l-143.9 83V530.4L814 373.1v175.2z" />
    </g>
  </svg>
);

export const AntigravityIdeIcon: React.FC<{ size?: number; className?: string }> = ({
  size = 12,
  className,
}) => (
  <svg
    width={size}
    height={size}
    className={className}
    viewBox="0 0 540 540"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M265,84L282,85L293,88L305,94L320,106L330,118L339,132L348,150L359,178L368,206L394,300L411,348L418,362L418,364L432,390L447,411L464,429L469,438L470,443L468,449L463,453L449,454L436,449L418,436L399,418L382,397L368,376L339,326L326,309L313,297L298,288L289,285L273,283L261,283L246,286L225,297L209,313L200,325L169,378L151,404L141,416L119,437L99,451L85,455L79,455L71,452L67,445L69,437L74,429L93,409L107,389L124,356L143,304L143,301L147,291L147,288L157,256L158,249L164,231L167,217L180,176L189,153L200,131L213,112L230,96L243,89L252,86L264,85L265,84Z"
      fill="currentColor"
    />
    <circle
      cx="410"
      cy="410"
      r="115"
      fill="var(--card-bg, #18181b)"
      stroke="currentColor"
      strokeWidth="24"
    />
    <path
      d="M355 410l27-27m-27 27l27 27"
      stroke="currentColor"
      strokeWidth="38"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M400 442l20-64" stroke="currentColor" strokeWidth="38" strokeLinecap="round" />
    <path
      d="M465 410l-27-27m27 27l-27 27"
      stroke="currentColor"
      strokeWidth="38"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);
