/** Selected members follow rotation order; other accounts keep their existing order. */
export function orderCliPoolAccounts<T extends { id: string }>(
  accounts: readonly T[],
  selectedIds: readonly string[],
): T[] {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  const selected = new Set(selectedIds);
  return [
    ...[...selected].flatMap((id) => {
      const account = byId.get(id);
      return account ? [account] : [];
    }),
    ...accounts.filter((account) => !selected.has(account.id)),
  ];
}
