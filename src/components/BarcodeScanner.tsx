import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
  DecodeHintType,
  NotFoundException,
} from "@zxing/library";
import "./BarcodeScanner.css";

type Props = {
  onDetected: (barcode: string) => void;
  onClose: () => void;
  onError?: (message: string) => void;
};

const PRODUCT_HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_128,
      BarcodeFormat.ITF,
      BarcodeFormat.RSS_14,
      BarcodeFormat.RSS_EXPANDED,
    ],
  ],
]);

function normalizeBarcode(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

export default function BarcodeScanner({ onDetected, onClose, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [status, setStatus] = useState("Запуск камеры…");
  const closedRef = useRef(false);
  const callbacksRef = useRef({ onDetected, onError });
  callbacksRef.current = { onDetected, onError };
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const stopReader = useCallback(() => {
    const reader = readerRef.current;
    readerRef.current = null;
    if (reader) {
      try {
        reader.reset();
      } catch {
        // ignore
      }
    }
    const video = videoRef.current;
    if (video?.srcObject instanceof MediaStream) {
      video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }, []);

  const handleClose = useCallback(() => {
    closedRef.current = true;
    stopReader();
    onCloseRef.current();
  }, [stopReader]);

  useEffect(() => {
    closedRef.current = false;
    const video = videoRef.current;
    if (!video) {
      callbacksRef.current.onError?.("Нет элемента видео.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      callbacksRef.current.onError?.("Камера недоступна в этом браузере.");
      handleClose();
      return;
    }

    const reader = new BrowserMultiFormatReader(PRODUCT_HINTS, 350);
    reader.timeBetweenDecodingAttempts = 120;
    readerRef.current = reader;

    const constraints: MediaStreamConstraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920, min: 640 },
        height: { ideal: 1080, min: 480 },
      },
    };

    reader
      .decodeFromConstraints(constraints, video, (result, err) => {
        if (closedRef.current) return;
        if (err && !(err instanceof NotFoundException)) {
          setStatus("Ошибка распознавания, держите штрихкод в кадре.");
          return;
        }
        if (!result) return;
        const text = normalizeBarcode(result.getText());
        if (!text || text.length < 4) return;
        closedRef.current = true;
        stopReader();
        callbacksRef.current.onDetected(text);
      })
      .then(() => {
        if (!closedRef.current) setStatus("Наведите камеру на штрихкод");
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          callbacksRef.current.onError?.("Нет доступа к камере. Разрешите доступ в настройках Safari.");
        } else if (msg.includes("NotFoundError")) {
          callbacksRef.current.onError?.("Камера не найдена на устройстве.");
        } else {
          callbacksRef.current.onError?.(`Камера: ${msg}`);
        }
        handleClose();
      });

    return () => {
      closedRef.current = true;
      stopReader();
    };
  }, [handleClose, stopReader]);

  return (
    <div className="barcodeScannerRoot" role="dialog" aria-modal="true" aria-label="Сканер штрихкода">
      <div className="barcodeScannerHeader">
        <button type="button" className="barcodeScannerClose" onClick={handleClose}>
          Закрыть
        </button>
        <p className="barcodeScannerStatus">{status}</p>
      </div>
      <div className="barcodeScannerVideoWrap">
        <video ref={videoRef} className="barcodeScannerVideo" playsInline muted autoPlay />
        <div className="barcodeScannerFrame" aria-hidden />
      </div>
      <p className="barcodeScannerHint">
        Хорошее освещение, держите телефон параллельно упаковке. На iPhone по IP-адресу может потребоваться HTTPS — см.
        README.
      </p>
    </div>
  );
}
