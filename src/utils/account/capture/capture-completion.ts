export interface AccountCaptureCounts {
  addedCount: number;
  alreadyPresentCount: number;
}

export interface AccountCaptureCompletion extends AccountCaptureCounts {
  platformName: string;
}

export function completeAccountCapture(
  completion: AccountCaptureCompletion,
  closeModal: () => void,
  showSuccessToast: (message: string) => void,
): void {
  const { platformName, addedCount, alreadyPresentCount } = completion;
  let message: string;

  if (addedCount === 0) {
    const plural = alreadyPresentCount !== 1;
    message = `${platformName} account${plural ? "s are" : " is"} already present in your account list.`;
  } else {
    const addedPlural = addedCount === 1 ? "" : "s";
    message = `Added ${addedCount} ${platformName} account${addedPlural} to your account list.`;
    if (alreadyPresentCount > 0) {
      const presentPlural = alreadyPresentCount === 1 ? "" : "s";
      const verb = alreadyPresentCount === 1 ? "was" : "were";
      message += ` ${alreadyPresentCount} account${presentPlural} ${verb} already present.`;
    }
  }

  closeModal();
  showSuccessToast(message);
}
