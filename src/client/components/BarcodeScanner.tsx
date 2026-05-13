import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import { useI18n } from "../i18n";

type Props = { onDetected: (text: string) => void; onClose: () => void };

export function BarcodeScanner({ onDetected, onClose }: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if ("BarcodeDetector" in globalThis) {
      let cancelled = false;
      const run = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((tr) => tr.stop());
            return;
          }
          video.srcObject = stream;
          await video.play();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const Detector = (globalThis as any).BarcodeDetector as new (opts: {
            formats: string[];
          }) => { detect: (src: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> };
          const detector = new Detector({
            formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"],
          });
          const loop = async () => {
            if (cancelled) return;
            try {
              const results = await detector.detect(video);
              const v = results[0]?.rawValue;
              if (v) {
                onDetected(v);
                return;
              }
            } catch {
              /* frame */
            }
            requestAnimationFrame(() => void loop());
          };
          void loop();
        } catch (e) {
          setError(String(e));
        }
      };
      void run();
      return () => {
        cancelled = true;
        const s = video.srcObject as MediaStream | null;
        s?.getTracks().forEach((tr) => tr.stop());
        video.srcObject = null;
      };
    }

    const reader = new BrowserMultiFormatReader();
    let active = true;
    reader
      .decodeFromVideoDevice(undefined, video, (result) => {
        if (!active) return;
        if (result) onDetected(result.getText());
      })
      .then((controls) => {
        controlsRef.current = controls;
      })
      .catch((e) => setError(String(e)));
    return () => {
      active = false;
      controlsRef.current?.stop();
      const s = video.srcObject as MediaStream | null;
      s?.getTracks().forEach((tr) => tr.stop());
      video.srcObject = null;
    };
  }, [onDetected]);

  return (
    <div className="scanner-overlay">
      <video ref={videoRef} muted playsInline />
      <div className="scanner-hint">
        <p>{t("scannerHint")}</p>
        {error ? <p style={{ color: "#ffb4b4" }}>{error}</p> : null}
        <button type="button" className="btn secondary" style={{ marginTop: 12 }} onClick={onClose}>
          {t("close")}
        </button>
      </div>
    </div>
  );
}
