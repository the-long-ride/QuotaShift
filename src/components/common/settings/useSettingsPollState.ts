import { useEffect, useState } from "react";
import {
  getIdleWarning,
  getTrackedWarning,
  idleSecsToMinSec,
  minSecToSecs,
} from "./settings-helpers";

export function useSettingsPollState(
  trackedPollInterval: number,
  onTrackedPollIntervalChange: (val: number) => void,
  idlePollInterval: number,
  onIdlePollIntervalChange: (val: number) => void,
  pollMin: number,
  pollMax: number,
) {
  const [trackedVal, setTrackedVal] = useState(trackedPollInterval);
  const { minutes: initMins, seconds: initSecs } = idleSecsToMinSec(idlePollInterval);
  const [idleMinutes, setIdleMinutes] = useState(initMins);
  const [idleSeconds, setIdleSeconds] = useState(initSecs);

  useEffect(() => {
    setTrackedVal(trackedPollInterval);
  }, [trackedPollInterval]);

  useEffect(() => {
    const { minutes, seconds } = idleSecsToMinSec(idlePollInterval);
    setIdleMinutes(minutes);
    setIdleSeconds(seconds);
  }, [idlePollInterval]);

  const idleTotalSecs = minSecToSecs(idleMinutes, idleSeconds);
  const trackedWarn = getTrackedWarning(trackedVal);
  const idleWarn = getIdleWarning(idleTotalSecs);

  const clampPoll = (value: number) => Math.max(pollMin, Math.min(pollMax, Math.round(value)));

  const commitTracked = () => {
    const val = clampPoll(trackedVal);
    setTrackedVal(val);
    onTrackedPollIntervalChange(val);
  };

  const applyIdleTotal = (total: number) => {
    const bounded = Math.max(0, Math.min(pollMax, total));
    const { minutes, seconds } = idleSecsToMinSec(bounded);
    setIdleMinutes(minutes);
    setIdleSeconds(seconds);
    if (bounded >= pollMin) onIdlePollIntervalChange(bounded);
  };

  const commitIdle = () => {
    const total = clampPoll(minSecToSecs(idleMinutes, idleSeconds));
    const { minutes, seconds } = idleSecsToMinSec(total);
    setIdleMinutes(minutes);
    setIdleSeconds(seconds);
    onIdlePollIntervalChange(total);
  };

  const handleTrackedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    const val = isNaN(v) ? 0 : Math.max(0, Math.min(pollMax, v));
    setTrackedVal(val);
    if (val >= pollMin) onTrackedPollIntervalChange(val);
  };

  const handleIdleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    applyIdleTotal(
      minSecToSecs(isNaN(v) ? 0 : Math.max(0, Math.min(pollMax / 60, v)), idleSeconds),
    );
  };

  const handleIdleSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    applyIdleTotal(minSecToSecs(idleMinutes, isNaN(v) ? 0 : Math.max(0, Math.min(59, v))));
  };

  return {
    trackedVal,
    setTrackedVal,
    idleMinutes,
    idleSeconds,
    trackedWarn,
    idleWarn,
    commitTracked,
    commitIdle,
    handleTrackedChange,
    handleIdleMinutesChange,
    handleIdleSecondsChange,
  };
}
