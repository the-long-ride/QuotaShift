import React from "react";
import { ClaudeLogo } from "../claude/ClaudeLogo";

export interface LogoProps {
  size?: number;
  className?: string;
  fill?: string;
}

export const GeminiLogo: React.FC<LogoProps> = ({
  size = 13,
  className,
  fill = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    className={className}
    viewBox="0 0 28 28"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M14 28C14 26.0633 13.6267 24.2433 12.88 22.54C12.1567 20.8367 11.165 19.355 9.905 18.095C8.645 16.835 7.16333 15.8433 5.46 15.12C3.75667 14.3733 1.93667 14 0 14C1.93667 14 3.75667 13.6383 5.46 12.915C7.16333 12.1683 8.645 11.165 9.905 9.905C11.165 8.645 12.1567 7.16333 12.88 5.46C13.6267 3.75667 14 1.93667 14 0C14 1.93667 14.3617 3.75667 15.085 5.46C15.8317 7.16333 16.835 8.645 18.095 9.905C19.355 11.165 20.8367 12.1683 22.54 12.915C24.2433 13.6383 26.0633 14 28 14C26.0633 14 24.2433 14.3733 22.54 15.12C20.8367 15.8433 19.355 16.835 18.095 18.095C16.835 19.355 15.8317 20.8367 15.085 22.54C14.3617 24.2433 14 26.0633 14 28Z"
      fill={fill}
    />
  </svg>
);

export const OpenAILogo: React.FC<LogoProps> = ({
  size = 12,
  className,
  fill = "currentColor",
}) => (
  <svg
    width={size}
    height={size}
    className={className}
    viewBox="0 0 512 512"
    fillRule="evenodd"
    clipRule="evenodd"
    strokeLinejoin="round"
    strokeMiterlimit={2}
    fill={fill}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M474.123 209.81c11.525-34.577 7.569-72.423-10.838-103.904-27.696-48.168-83.433-72.94-137.794-61.414a127.14 127.14 0 00-95.475-42.49c-55.564 0-104.936 35.781-122.139 88.593-35.781 7.397-66.574 29.76-84.637 61.414-27.868 48.167-21.503 108.72 15.826 150.007-11.525 34.578-7.569 72.424 10.838 103.733 27.696 48.34 83.433 73.111 137.966 61.585 24.084 27.18 58.833 42.835 95.303 42.663 55.564 0 104.936-35.782 122.139-88.594 35.782-7.397 66.574-29.76 84.465-61.413 28.04-48.168 21.676-108.722-15.654-150.008v-.172zm-39.567-87.218c11.01 19.267 15.139 41.803 11.354 63.65-.688-.516-2.064-1.204-2.924-1.72l-101.152-58.49a16.965 16.965 0 00-16.687 0L206.621 194.5v-50.232l97.883-56.597c45.587-26.32 103.732-10.666 130.052 34.921zm-227.935 104.42l49.888-28.9 49.887 28.9v57.63l-49.887 28.9-49.888-28.9v-57.63zm23.223-191.81c22.364 0 43.867 7.742 61.07 22.02-.688.344-2.064 1.204-3.097 1.72L186.666 117.26c-5.161 2.925-8.258 8.43-8.258 14.45v136.934l-43.523-25.116V130.333c0-52.64 42.491-95.13 95.131-95.302l-.172.172zM52.14 168.697c11.182-19.268 28.557-34.062 49.544-41.803V247.14c0 6.02 3.097 11.354 8.258 14.45l118.354 68.295-43.695 25.288-97.711-56.425c-45.415-26.32-61.07-84.465-34.75-130.052zm26.665 220.71c-11.182-19.095-15.139-41.802-11.354-63.65.688.516 2.064 1.204 2.924 1.72l101.152 58.49a16.965 16.965 0 0016.687 0l118.354-68.467v50.232l-97.883 56.425c-45.587 26.148-103.732 10.665-130.052-34.75h.172zm204.54 87.39c-22.192 0-43.867-7.741-60.898-22.02a62.439 62.439 0 003.097-1.72l101.152-58.317c5.16-2.924 8.429-8.43 8.257-14.45V243.527l43.523 25.116v113.022c0 52.64-42.663 95.303-95.131 95.303v-.172zM461.22 343.303c-11.182 19.267-28.729 34.061-49.544 41.63V264.687c0-6.021-3.097-11.526-8.257-14.45L284.893 181.77l43.523-25.116 97.883 56.424c45.587 26.32 61.07 84.466 34.75 130.053l.172.172z" />
  </svg>
);

export const ModelLogoSeparator: React.FC<{
  size?: number;
  className?: string;
  fill?: string;
}> = ({ size = 8, className = "model-logo-sep", fill = "currentColor" }) => (
  <span className={className}>
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 9.75C2 9.33579 2.33579 9 2.75 9H17.25C17.6642 9 18 9.33579 18 9.75C18 10.1642 17.6642 10.5 17.25 10.5H2.75C2.33579 10.5 2 10.1642 2 9.75Z"
        fill={fill}
      />
    </svg>
  </span>
);

export const ClaudeOpenAIDualLogo: React.FC<{
  claudeSize?: number;
  openAISize?: number;
  sepSize?: number;
  className?: string;
  fill?: string;
}> = ({
  claudeSize = 12,
  openAISize = 12,
  sepSize = 8,
  className = "model-dual-logo",
  fill = "currentColor",
}) => (
  <div className={className}>
    <ClaudeLogo size={claudeSize} />
    <ModelLogoSeparator size={sepSize} fill={fill} />
    <OpenAILogo size={openAISize} fill={fill} />
  </div>
);

export const ModelPoolIcon: React.FC<{
  model: string;
  size?: number;
  className?: string;
  fill?: string;
}> = ({ model, size = 13, className, fill }) => {
  const m = model.toLowerCase();
  if (m.includes("gemini")) {
    return <GeminiLogo size={size} className={className} fill={fill} />;
  }
  if (m.includes("claude") || m.includes("openai") || m.includes("gpt")) {
    return (
      <ClaudeOpenAIDualLogo
        claudeSize={size - 1}
        openAISize={size - 1}
        sepSize={8}
        className={className ? `model-dual-logo ${className}` : "model-dual-logo"}
        fill={fill}
      />
    );
  }
  return <span className={className}>{model}</span>;
};
