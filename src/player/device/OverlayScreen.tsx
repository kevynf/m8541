import icon from "../../assets/img/offline.svg?raw";

interface OverlayScreenProps {
  message: string;
}

export default function OverlayScreen({ message }: OverlayScreenProps) {
  return (
    <div className="m8541-overlay-screen" data-testid="m8541-error-screen" aria-hidden="true">
      <div className="sad-m8541-container">
        <span style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: icon }} />
        <p className="error-message">{message}</p>
      </div>
    </div>
  );
}
