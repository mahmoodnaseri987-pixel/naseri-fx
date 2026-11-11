"use client";

/* انتخاب‌گر رسانه — برای انتخاب عکس/ویدیو از کتابخانه یا آپلود مستقیم */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  MediaGrid,
  UploadButton,
  useMediaList,
} from "@/components/site/admin/media-manager";

type MediaPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
  /** محدود کردن نوع فایل: image | video */
  kind?: "image" | "video";
  title?: string;
};

export function MediaPickerDialog({
  open,
  onOpenChange,
  onSelect,
  kind = "image",
  title,
}: MediaPickerDialogProps) {
  const { media, loading, uploading, upload } = useMediaList();

  const filtered = media.filter((m) => (kind === "video" ? m.kind === "video" : m.kind === "image"));
  const accept =
    kind === "video"
      ? "video/mp4,video/webm,video/quicktime"
      : "image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif";

  function pick(url: string) {
    onSelect(url);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-zinc-800 bg-zinc-900 sm:max-w-2xl">
        <DialogHeader dir="rtl">
          <DialogTitle className="text-zinc-50">
            {title ?? (kind === "video" ? "انتخاب ویدیو" : "انتخاب تصویر")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">
            از کتابخانه انتخاب کنید یا همین‌جا فایل جدید آپلود کنید.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" dir="rtl">
          <div className="flex justify-end">
            <UploadButton
              onPick={async (file) => {
                const created = await upload(file);
                if (created) pick(`/api/media/${created.id}`);
              }}
              uploading={uploading}
              accept={accept}
              label={kind === "video" ? "آپلود ویدیو" : "آپلود عکس"}
              className="h-9 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
            />
          </div>

          <MediaGrid
            media={filtered}
            loading={loading}
            onRefresh={() => undefined}
            onSelect={(m) => pick(`/api/media/${m.id}`)}
            emptyHint={
              kind === "video"
                ? "هنوز ویدیویی در کتابخانه نیست — مستقیم آپلود کنید یا لینک آپارات وارد کنید."
                : "هنوز عکسی در کتابخانه نیست — اولین تصویر را آپلود کنید."
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
