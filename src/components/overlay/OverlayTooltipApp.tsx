import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

export interface OverlayTooltipPayload {
  text: string;
  placement: "above" | "below";
  x: number;
  y: number;
  cardCenterX?: number;
  visible: boolean;
}

import { logFrontend } from "../../utils/common/logger";

export const OverlayTooltipApp: React.FC = () => {
  const [data, setData] = useState<OverlayTooltipPayload | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<OverlayTooltipPayload>("overlay-tooltip-data", async (event) => {
      const payload = event.payload;
      try {
        const win = getCurrentWebviewWindow();
        if (payload?.visible && payload?.text) {
          const outerSize = await win.outerSize().catch(() => null);
          const winWidth = outerSize?.width || 340;
          const targetX = typeof payload.cardCenterX === "number"
            ? Math.round(payload.cardCenterX - winWidth / 2)
            : payload.x;
          setData(payload);
          await win.setPosition(new PhysicalPosition(targetX, payload.y));
          await win.show();
        } else {
          setData(null);
          await win.hide();
        }
      } catch (err) {
        logFrontend("ERROR", "tooltip:window", `OverlayTooltip window setPosition/show failed: ${String(err)}`);
      }
    }).then((u) => {
      unlisten = u;
    }).catch(() => {});

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  if (!data?.visible || !data?.text) return null;

  return (
    <div className="overlay-tooltip-root">
      <div className={`overlay-tooltip overlay-tooltip--${data.placement}`} role="tooltip">
        <span className="overlay-tooltip-text">{data.text}</span>
      </div>
    </div>
  );
};
