import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { accountCardColumnCount } from "../../utils/account/account-card-columns";

type AccountCardGridStyle = CSSProperties & {
  "--account-card-columns": number;
};

function currentColumnCount(): number {
  if (typeof window === "undefined") return 1;
  return accountCardColumnCount(window.innerWidth);
}

export function useAccountCardGridColumns(): AccountCardGridStyle {
  const [columns, setColumns] = useState(currentColumnCount);

  useEffect(() => {
    const update = () => setColumns(accountCardColumnCount(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return useMemo(() => ({ "--account-card-columns": columns }) as AccountCardGridStyle, [columns]);
}
