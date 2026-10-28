import logo from "../../assets/img/boot-logo.svg?raw";

export default function LoadingScreen() {
  return (
    <div
      className="loading-screen"
      data-testid="loading-screen"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: logo }}
    />
  );
}
