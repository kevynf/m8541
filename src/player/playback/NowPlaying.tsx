import { useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import ProgressBar from "../shared/ProgressBar.tsx";
import Marquee from "../shared/Marquee.tsx";
import RepeatOneIcon from "../shared/icons/RepeatOneIcon.tsx";
import RepeatAllIcon from "../shared/icons/RepeatAllIcon.tsx";
import ShuffleIcon from "../shared/icons/ShuffleIcon.tsx";
import VolumeIconLow from "../shared/icons/VolumeIconLow.tsx";
import VolumeIconHigh from "../shared/icons/VolumeIconHigh.tsx";
import { createI18n } from "../i18n.ts";
import type { I18n } from "../i18n.ts";
import { formatTime, formatRemaining, formatDuration } from "./time-format.ts";

type RepeatMode = "none" | "one" | "all";

type NowPlayingMode = "progress" | "scrubbing" | "volume";

type UrlNavigator = (url: string) => void | Promise<void>;

export type ScrubValue = number & { detail?: number };

const playModesKeys: Record<string, string> = {
  "shuffle-none": "ASE.Web.M8541.NowPlaying.ShuffleOn",
  "shuffle-one": "ASE.Web.M8541.NowPlaying.ShuffleOnRepeatOne",
  "shuffle-all": "ASE.Web.M8541.NowPlaying.ShuffleOnRepeatAll",
  "ordered-one": "ASE.Web.M8541.NowPlaying.RepeatOne",
  "ordered-all": "ASE.Web.M8541.NowPlaying.RepeatAll",
};

interface NowPlayingProps {
  songIndex: number;
  songCount: number;
  songId?: string;
  title?: string;
  titleUrl?: string;
  navigateToUrl?: UrlNavigator;
  artistName?: string;
  albumName?: string;
  currentTime?: number;
  duration?: number;
  isSeeking?: boolean;
  seekPreviewTime?: number;
  isAdjustingVolume?: boolean;
  volume?: number;
  isPositionDisabled?: boolean;
  shuffleMode?: boolean;
  repeatMode?: RepeatMode;
  shouldFocus?: boolean;
  i18n?: I18n;
  onScrubFocus?: () => void;
  onScrub?: (value: ScrubValue) => void;
  onScrubCommit?: () => void;
  onScrubBlur?: () => void;
  onVolumeFocus?: () => void;
  onVolume?: (value: ScrubValue) => void;
  onVolumeBlur?: () => void;
}

export default function NowPlaying({
  songIndex,
  songCount,
  songId = undefined,
  title = undefined,
  titleUrl = undefined,
  navigateToUrl = undefined,
  artistName = undefined,
  albumName = undefined,
  currentTime = 0,
  duration = 0,
  isSeeking = false,
  seekPreviewTime = undefined,
  isAdjustingVolume = false,
  volume = 50,
  isPositionDisabled = false,
  shuffleMode = false,
  repeatMode = "none",
  shouldFocus = false,
  i18n,
  onScrubFocus,
  onScrub,
  onScrubCommit,
  onScrubBlur,
  onVolumeFocus,
  onVolume,
  onVolumeBlur,
}: NowPlayingProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fallbackI18n = useRef<I18n | null>(null);
  const currentI18n = i18n ?? fallbackI18n.current ?? createI18n();
  fallbackI18n.current = currentI18n;

  const [mode, setMode] = useState<NowPlayingMode>("progress");
  const [lastMode, setLastMode] = useState<NowPlayingMode>("volume");
  const nextMode = isAdjustingVolume ? "volume" : isSeeking ? "scrubbing" : "progress";
  if (nextMode !== mode) {
    setMode(nextMode);
    if (nextMode !== "progress") setLastMode(nextMode);
  }

  useLayoutEffect(() => {
    if (shouldFocus) rootRef.current?.focus({ preventScroll: true });
  }, [shouldFocus]);

  async function openUrl(url: UrlNavigator, href: string) {
    try {
      await url(href);
    } catch (e) {
      console.error(`Host navigation failed for "${href}"`, e);
    }
  }

  function handleTitleLinkClick(event: MouseEvent<HTMLAnchorElement>) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
    if (!navigateToUrl || event.defaultPrevented || event.button !== 0 || modified) return;
    event.preventDefault();
    openUrl(navigateToUrl, event.currentTarget.href);
  }

  const displayTime = isSeeking && seekPreviewTime !== undefined ? seekPreviewTime : currentTime;
  const elapsedLabel = duration > 0 ? formatTime(displayTime, currentI18n) : "";
  const remainingLabel = formatRemaining(displayTime, duration, currentI18n);
  const positionLabel = currentI18n.t("ASE.Web.M8541.NowPlaying.Position", {
    index: currentI18n.formatNumber(songIndex),
    total: currentI18n.formatNumber(songCount),
  });
  const playModesKey = playModesKeys[`${shuffleMode ? "shuffle" : "ordered"}-${repeatMode}`];
  const playModesLabel = playModesKey ? currentI18n.t(playModesKey) : "";
  const positionValue = duration > 0 ? Math.floor(displayTime) : 0;

  return (
    <div
      className="now-playing"
      data-testid="now-playing"
      role="group"
      aria-labelledby="menu-title"
      tabIndex={-1}
      ref={rootRef}
    >
      <div className="now-playing-index" data-testid="now-playing-index">
        <span>{positionLabel}</span>
        {(shuffleMode || repeatMode !== "none") && (
          <div className="play-modifier" aria-hidden="true">
            {repeatMode === "one" ? (
              <RepeatOneIcon className="repeat-one-icon" />
            ) : repeatMode === "all" ? (
              <RepeatAllIcon className="repeat-all-icon" />
            ) : null}
            {shuffleMode ? <ShuffleIcon className="shuffle-icon" /> : null}
          </div>
        )}
        {playModesLabel && (
          <span className="visually-hidden" data-testid="now-playing-play-modes">
            {playModesLabel}
          </span>
        )}
      </div>{" "}
      <div className="now-playing-info">
        {title && (
          <div className="song-title" data-testid="now-playing-song-title">
            {titleUrl ? (
              <a
                className="song-title-link"
                href={titleUrl}
                data-testid="now-playing-song-link"
                onClick={handleTitleLinkClick}
              >
                <Marquee text={title} resetKey={songId} />
              </a>
            ) : (
              <Marquee text={title} resetKey={songId} />
            )}
          </div>
        )}{" "}
        {artistName && (
          <div className="artist" data-testid="now-playing-artist" dir="auto">
            {artistName}
          </div>
        )}{" "}
        {albumName && (
          <div className="album" data-testid="now-playing-album" dir="auto">
            {albumName}
          </div>
        )}
      </div>{" "}
      <div className="now-playing-progress" data-testid="now-playing-progress" data-mode={mode}>
        <div className="time-and-progress" aria-hidden="true">
          <ProgressBar value={displayTime} max={duration} testId="now-playing-progress" />{" "}
          <div className="progress-labels">
            <span data-testid="now-playing-elapsed">{elapsedLabel}</span>{" "}
            <span data-testid="now-playing-remaining">{remainingLabel}</span>
          </div>
        </div>{" "}
        <div
          className={`scrubbing-indicator${lastMode !== "scrubbing" ? " inactive" : ""}`}
          data-testid="now-playing-scrubber"
        >
          <ProgressBar
            variant="marker"
            value={positionValue}
            max={duration}
            disabled={isPositionDisabled}
            label={currentI18n.t("ASE.Web.M8541.NowPlaying.PlaybackProgress")}
            valuetext={formatDuration(positionValue, currentI18n)}
            testId="now-playing-scrub"
            onFocus={() => onScrubFocus?.()}
            onInput={(value) => onScrub?.(value)}
            onChange={() => onScrubCommit?.()}
            onBlur={() => onScrubBlur?.()}
          />{" "}
          <div className="progress-labels" aria-hidden="true">
            <span data-testid="now-playing-scrub-elapsed">{elapsedLabel}</span>{" "}
            <span data-testid="now-playing-scrub-remaining">{remainingLabel}</span>
          </div>
        </div>{" "}
        <div
          className={`volume-labels${lastMode !== "volume" ? " inactive" : ""}`}
          data-testid="now-playing-volume-labels"
        >
          <VolumeIconLow className="volume-icon-low" aria-hidden="true" />{" "}
          <ProgressBar
            value={volume}
            max={100}
            label={currentI18n.t("ASE.Web.M8541.NowPlaying.Volume")}
            valuetext={currentI18n.formatNumber(volume / 100, {
              style: "percent",
            })}
            testId="now-playing-volume"
            onFocus={() => onVolumeFocus?.()}
            onInput={(value) => onVolume?.(value)}
            onBlur={() => onVolumeBlur?.()}
          />{" "}
          <VolumeIconHigh className="volume-icon-high" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
