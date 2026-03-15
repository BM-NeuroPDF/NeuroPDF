"use client";

type PopupType = "success" | "error" | "info";

interface Props {
  type: PopupType;
  message: string;
  open: boolean;
  onClose: () => void;
}

export default function Popup({ type, message, open, onClose }: Props) {

  if (!open) return null;

  const styles = {
    success: "bg-green-50 border-green-500 text-green-700",
    error: "bg-red-50 border-red-500 text-red-700",
    info: "bg-blue-50 border-blue-500 text-blue-700",
  };

  return (
    <div className="fixed top-6 right-6 z-50">
      <div
        className={`flex items-center gap-3 border-l-4 px-5 py-4 rounded-lg shadow-lg ${styles[type]}`}
      >
        <span>{message}</span>

        <button
          onClick={onClose}
          className="ml-3 opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}