export interface AccountCaptureLabelOptions {
  providerName?: string | null;
  fallbackLabel?: string | null;
  email?: string | null;
  defaultLabel: string;
}

function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function resolveAccountCaptureLabel({
  providerName,
  fallbackLabel,
  email,
  defaultLabel,
}: AccountCaptureLabelOptions): string {
  const emailLocalPart = nonEmpty(email)?.split("@", 1)[0]?.trim();
  return nonEmpty(providerName) ?? nonEmpty(fallbackLabel) ?? (emailLocalPart || defaultLabel);
}
