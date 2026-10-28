import PlayIcon from "../shared/icons/PlayIcon.tsx";
import PauseIcon from "../shared/icons/PauseIcon.tsx";

interface MenuTitleProps {
  title?: string;
  hasLoadedItem?: boolean;
  isPlaying?: boolean;
  isBrick?: boolean;
  brickBalls?: number;
  brickScore?: number;
}

export default function MenuTitle({
  title,
  hasLoadedItem,
  isPlaying,
  isBrick = false,
  brickBalls = 0,
  brickScore = 0,
}: MenuTitleProps) {
  return (
    <div id="menu-title" className="menu-title" data-testid="menu-title">
      {hasLoadedItem && (
        <div
          className={`play-icon ${isPlaying ? "play" : "pause"}`}
          data-testid="now-playing-indicator"
          aria-hidden="true"
        >
          {isPlaying ? <PlayIcon /> : <PauseIcon />}
        </div>
      )}
      <div className="battery-indicator" data-testid="battery-indicator" aria-hidden="true" />
      {isBrick ? (
        <div className="screen-title brick-game-title" dir="ltr">
          <span className="balls-left" data-testid="brick-balls">
            {brickBalls}
          </span>
          <span className="game-score" data-testid="brick-score">
            {brickScore}
          </span>
        </div>
      ) : (
        <div className="screen-title" dir="auto">
          {title}
        </div>
      )}
    </div>
  );
}
