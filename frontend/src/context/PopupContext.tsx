"use client";

import { createContext, useContext, useState } from "react";
import Popup from "@/components/ui/Popup";

type PopupType = "success" | "error" | "info";

interface PopupItem {
  id: number;
  type: PopupType;
  message: string;
}

interface PopupContextType {
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
  showInfo: (msg: string) => void;
}

const PopupContext = createContext<PopupContextType | null>(null);

export function PopupProvider({ children }: { children: React.ReactNode }) {

  const [popups, setPopups] = useState<PopupItem[]>([]);

  const showPopup = (type: PopupType, message: string) => {

    const id = Date.now();

    setPopups((prev) => [...prev, { id, type, message }]);

    setTimeout(() => {
      setPopups((prev) => prev.filter((p) => p.id !== id));
    }, 3000);
  };

  const showSuccess = (msg: string) => showPopup("success", msg);
  const showError = (msg: string) => showPopup("error", msg);
  const showInfo = (msg: string) => showPopup("info", msg);

  return (
    <PopupContext.Provider value={{ showSuccess, showError, showInfo }}>
      {children}

      <div className="fixed top-6 right-6 flex flex-col gap-3 z-[10000]">
        {popups.map((popup) => (
          <Popup
            key={popup.id}
            type={popup.type}
            message={popup.message}
            open={true}
            onClose={() =>
              setPopups((prev) => prev.filter((p) => p.id !== popup.id))
            }
          />
        ))}
      </div>

    </PopupContext.Provider>
  );
}

export function usePopup() {
  const context = useContext(PopupContext);
  if (!context) throw new Error("usePopup must be used inside PopupProvider");
  return context;
}