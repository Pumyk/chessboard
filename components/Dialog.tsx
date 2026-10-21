"use client";
// Confirm/information dialog. role=alertdialog for confirms, focus trap via
// the native <dialog> element, Esc closes.

import { useRef, useEffect } from "react";
import { Button } from "./Button";

export function Dialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onCancel,
  danger,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      className="m-auto w-[min(90vw,360px)] rounded-lg border border-border bg-surface-raised p-6 text-text shadow-pop backdrop:bg-black/70"
    >
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <p className="mb-4 text-sm text-text-muted">{body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
