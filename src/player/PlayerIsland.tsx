import { StrictMode } from "react";

import M8541 from "./M8541.tsx";

interface PlayerIslandProps {
  catalogUrl?: string;
}

export default function PlayerIsland({ catalogUrl }: PlayerIslandProps) {
  return (
    <StrictMode>
      <M8541 catalogUrl={catalogUrl} />
    </StrictMode>
  );
}
