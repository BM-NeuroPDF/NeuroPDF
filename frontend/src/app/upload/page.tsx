"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useUnifiedPdfDrop } from "@/hooks/useUnifiedPdfDrop";

import { useGuestLimit } from "@/hooks/useGuestLimit";
import UsageLimitModal from "@/components/UsageLimitModal";
import { usePdf } from "@/context/PdfContext";
import { useLanguage } from "@/context/LanguageContext";
import { getMaxUploadBytes } from "@/app/config/fileLimits";

import Popup from "@/components/ui/Popup";
import { usePopup } from "@/hooks/usePopup";

const PdfViewer = dynamic(() => import("@/components/PdfViewer"), { ssr: false });

export default function UploadPage() {

  const { data: session, status } = useSession();
  const { pdfFile, savePdf } = usePdf();
  const { t } = useLanguage();

  const { popup, showError, showSuccess, showInfo, close } = usePopup();

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const isGuest = status !== "authenticated";
  const maxBytes = getMaxUploadBytes(isGuest);

  const { usageInfo, showLimitModal, closeLimitModal, redirectToLogin } =
    useGuestLimit();

  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: any[]) => {

      if (fileRejections.length > 0) {
        const err = fileRejections[0].errors[0];

        if (err.code === "file-invalid-type") {
          showError(t("invalidFileType"));
          return;
        }

        if (err.code === "file-too-large") {
          showError(t("fileSizeExceeded"));
          return;
        }

        showError(err.message);
        return;
      }

      if (acceptedFiles?.length) {

        const f = acceptedFiles[0];

        if (f.type !== "application/pdf") {
          showError(t("invalidFileType"));
          return;
        }

        if (f.size > maxBytes) {
          showError(t("fileSizeExceeded"));
          return;
        }

        setFile(f);
      }
    },
    [maxBytes, t]
  );

  const { getRootProps, getInputProps, isDragActive } = useUnifiedPdfDrop({
    options: {
      multiple: false,
      accept: { "application/pdf": [".pdf"] },
      maxSize: maxBytes,
    },
    onFiles: onDrop,
  });

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {

    const f = e.target.files?.[0];

    if (!f) return;

    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      showError(t("invalidFileType"));
      return;
    }

    if (f.size > maxBytes) {
      showError(t("fileSizeExceeded"));
      return;
    }

    setFile(f);
  };

  const handleAddToPanel = () => {

    if (!file) {
      showInfo(t("selectFile"));
      return;
    }

    setUploading(true);

    try {

      savePdf(file);

      showSuccess(t("uploadSuccess") || "PDF added to panel");

    } catch (err) {

      showError(t("uploadError") || "Error adding file");

    } finally {
      setUploading(false);
    }
  };

  return (
    <main className="min-h-screen p-6 max-w-4xl mx-auto font-bold text-[var(--foreground)]">

      <h1 className="text-3xl mb-6 tracking-tight">{t("uploadPageTitle")}</h1>

      {usageInfo && !showLimitModal && !session && (
        <div className="info-box mb-4">
          {usageInfo.message}
        </div>
      )}

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`container-card border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300
        ${
          isDragActive
            ? "border-[var(--button-bg)] bg-[var(--background)] opacity-80"
            : "border-[var(--navbar-border)] hover:border-[var(--button-bg)]"
        }`}
      >
        <input {...getInputProps()} accept="application/pdf" />

        <div className="flex flex-col items-center gap-3">

          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"
               strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 opacity-50">

            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />

          </svg>

          {isDragActive ? <p>{t("dropActive")}</p> : <p>{t("dropPassive")}</p>}

        </div>

        {file && !isDragActive && (
          <p className="mt-4 text-sm opacity-60 font-normal">
            {t("currentFile")} <b>{file.name}</b>
          </p>
        )}

      </div>

      {/* File Select */}
      <div className="mt-6 flex justify-start">

        <label className="btn-primary cursor-pointer shadow-md hover:scale-105 flex items-center gap-2">

          {t("selectFile")}

          <input
            type="file"
            className="hidden"
            accept=".pdf"
            onChange={handleSelect}
          />

        </label>

      </div>

      {/* Preview */}
      {file && (

        <div className="mt-6 space-y-6">

          <div className="rounded-xl overflow-hidden border border-[var(--container-border)] shadow-lg">

            <PdfViewer file={file} height={550} />

          </div>

          <button
            onClick={handleAddToPanel}
            disabled={uploading}
            className="btn-primary w-full sm:w-auto px-8 py-3 shadow-lg hover:scale-105"
          >
            {uploading ? t("uploading") || "Uploading..." : t("uploadButton")}
          </button>

        </div>

      )}

      <UsageLimitModal
        isOpen={showLimitModal}
        onClose={closeLimitModal}
        onLogin={redirectToLogin}
        usageCount={usageInfo?.usage_count}
        maxUsage={3}
      />

      {/* GLOBAL POPUP */}

      <Popup
        type={popup.type}
        message={popup.message}
        open={popup.open}
        onClose={close}
      />

    </main>
  );
}