"use client";

/* کتابخانه رسانه‌ها — هم به‌صورت مدیریت کامل و هم به‌صورت انتخاب‌گر برای فرم‌ها */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CloudUpload,
  Copy,
  FileVideo,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatBytes, uploadMedia } from "@/lib/upload-client";
import type { MediaMeta } from "@/lib/types";

export function useMediaList() {
  const { toast } = useToast();
  const [media, setMedia] = useState<MediaMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/media");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMedia(data.media);
    } catch {
      toast({ title: "دریافت فهرست رسانه‌ها ناموفق بود.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = useCallback(
    async (file: File): Promise<MediaMeta | null> => {
      setUploading(true);
      try {
        const media = await uploadMedia(file, (pct) => setProgress(pct));
        await load();
        toast({ title: `«${media.name}» آپلود شد.` });
        return media as MediaMeta;
      } catch (err) {
        toast({
          title: err instanceof Error ? err.message : "آپلود ناموفق بود.",
          variant: "destructive",
        });
        return null;
      } finally {
        setProgress(0);
        setUploading(false);
      }
    },
    [load, toast],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/admin/media/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error();
        setMedia((list) => list.filter((m) => m.id !== id));
        toast({ title: "رسانه حذف شد." });
      } catch {
        toast({ title: "حذف ناموفق بود.", variant: "destructive" });
      }
    },
    [toast],
  );

  return { media, loading, uploading, progress, upload, remove, load, inputRef };
}

export function UploadButton({
  onPick,
  uploading,
  accept = "image/*,video/mp4,video/webm,video/quicktime",
  label = "آپلود فایل",
  className,
}: {
  onPick: (file: File) => void;
  uploading: boolean;
  accept?: string;
  label?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onPick(file);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className={className ?? "h-10 rounded-xl bg-emerald-500 font-bold text-zinc-950 hover:bg-emerald-400"}
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <CloudUpload className="h-4 w-4" aria-hidden="true" />
        )}
        {label}
      </Button>
    </>
  );
}

type MediaGridProps = {
  media: MediaMeta[];
  loading: boolean;
  onRefresh: () => void;
  onDelete?: (m: MediaMeta) => void;
  onSelect?: (m: MediaMeta) => void;
  emptyHint?: string;
};

export function MediaGrid({ media, loading, onRefresh, onDelete, onSelect, emptyHint }: MediaGridProps) {
  const { toast } = useToast();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" dir="rtl">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" aria-hidden="true" />
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 py-12 text-center" dir="rtl">
        <p className="text-sm text-zinc-500">{emptyHint ?? "هنوز رسانه‌ای آپلود نکرده‌اید."}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" dir="rtl">
      {media.map((m) => (
        <figure
          key={m.id}
          className={`group overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 ${
            onSelect ? "cursor-pointer transition-colors hover:border-emerald-500/60" : ""
          }`}
          onClick={() => onSelect?.(m)}
        >
          <div className="relative aspect-video w-full overflow-hidden bg-black">
            {m.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${m.id}`}
                alt={m.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-zinc-400">
                <FileVideo className="h-8 w-8" aria-hidden="true" />
                <span className="font-mono text-[10px]">{m.mime}</span>
              </div>
            )}
          </div>
          <figcaption className="space-y-1.5 p-2.5">
            <p className="truncate text-xs font-medium text-zinc-200" title={m.name}>
              {m.name}
            </p>
            <div className="flex items-center justify-between gap-1">
              <Badge variant="secondary" className="bg-zinc-800 text-[10px] text-zinc-300">
                {formatBytes(m.size)}
              </Badge>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  aria-label="کپی آدرس"
                  onClick={(e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/api/media/${m.id}`;
                    navigator.clipboard
                      .writeText(url)
                      .then(() => toast({ title: "آدرس رسانه کپی شد." }))
                      .catch(() => toast({ title: "کپی ناموفق بود.", variant: "destructive" }));
                  }}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
                {onDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-400 hover:bg-rose-500/10 hover:text-rose-400"
                    aria-label="حذف"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(m);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

/* --- مدیریت کامل کتابخانه رسانه (تب رسانه‌ها) --- */
export function MediaManager() {
  const { media, loading, uploading, progress, upload, remove, load } = useMediaList();
  const { toast } = useToast();
  const [deleting, setDeleting] = useState<MediaMeta | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const totalBytes = media.reduce((sum, m) => sum + m.size, 0);

  async function confirmDelete() {
    if (!deleting) return;
    setDeletingBusy(true);
    await remove(deleting.id);
    setDeletingBusy(false);
    setDeleting(null);
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-zinc-100">کتابخانه رسانه</h3>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            {media.length} فایل — مجموع {formatBytes(totalBytes)} از سقف استفاده پیشنهادی ۲۰
            مگابایت. تصویر تا ۲٫۵ و ویدیو تا ۱۰ مگابایت.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={load}
            aria-label="بازخوانی"
            className="h-10 w-10 rounded-xl border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </Button>
          <UploadButton onPick={(file) => upload(file)} uploading={uploading} label="آپلود عکس / ویدیو" />
          {uploading && progress > 0 && (
            <span className="text-xs font-black tabular-nums text-zinc-400">{progress}٪</span>
          )}
        </div>
      </div>

      <MediaGrid
        media={media}
        loading={loading}
        onRefresh={load}
        onDelete={(m) => setDeleting(m)}
        emptyHint="اولین عکس یا ویدیو را آپلود کنید — بعداً می‌توانید در بنر، لوگو، باکس‌ها و موشن گرافیک از آن‌ها استفاده کنید."
      />

      <AlertDialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-900" dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-zinc-50">
              حذف «{deleting?.name}»؟
            </AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              اگر این فایل در بنر، لوگو یا باکسی استفاده شده باشد، آن بخش بدون تصویر می‌شود.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100">
              انصراف
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingBusy}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              className="bg-rose-600 font-bold text-white hover:bg-rose-500"
            >
              {deletingBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : "حذف کن"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
