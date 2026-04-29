'use client';

/**
 * useFileUpload — local-first 版本
 *
 * Flow:
 *   idle → uploading (有 progress) → processing → done
 *                                              ↘ error
 *
 * 改造重點: 不走 presigned URL，直接 POST FormData 到 /api/uploads
 * (server 寫到 public/uploads/，回傳 storage key)
 */

import { useCallback, useRef, useState } from 'react';
import { triggerIngest } from '@/app/(merchant)/merchant/products/new/actions';

export type UploadState = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export interface UseFileUploadReturn {
  state: UploadState;
  progress: number;
  error: string | null;
  upload: (file: File) => Promise<{ key: string } | null>;
  reset: () => void;
}

export function useFileUpload(): UseFileUploadReturn {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setState('idle');
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback(
    async (file: File): Promise<{ key: string } | null> => {
      try {
        setError(null);
        setProgress(0);

        // step 1: POST 到 /api/uploads (local fs write)
        setState('uploading');
        const result = await postWithProgress({
          file,
          onProgress: (pct) => setProgress(pct),
          xhrRef,
        });

        if (!result.success) {
          setError(result.error ?? '上傳失敗');
          setState('error');
          return null;
        }

        // step 2: 通知 Inngest 開始處理
        setState('processing');
        const ingest = await triggerIngest({ r2Key: result.key });
        if (!ingest.ingested) {
          setError('觸發背景處理失敗，請重試');
          setState('error');
          return null;
        }

        setState('done');
        return { key: result.key };
      } catch (err) {
        const msg = err instanceof Error ? err.message : '上傳失敗';
        setError(msg);
        setState('error');
        return null;
      }
    },
    [],
  );

  return { state, progress, error, upload, reset };
}

// ---------- 內部 helper: XHR POST with progress ----------

type UploadResponse =
  | { success: true; key: string; publicUrl: string; size: number }
  | { success: false; error: string };

function postWithProgress(opts: {
  file: File;
  onProgress: (pct: number) => void;
  xhrRef: React.MutableRefObject<XMLHttpRequest | null>;
}): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    opts.xhrRef.current = xhr;

    const formData = new FormData();
    formData.append('file', opts.file);

    xhr.open('POST', '/api/uploads', true);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      opts.onProgress(pct);
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.success) {
          resolve(data);
        } else {
          resolve({ success: false, error: data.error ?? `HTTP ${xhr.status}` });
        }
      } catch {
        reject(new Error(`Invalid response: ${xhr.responseText?.slice(0, 100)}`));
      }
    };

    xhr.onerror = () => reject(new Error('網路錯誤'));
    xhr.onabort = () => reject(new Error('上傳已取消'));
    xhr.ontimeout = () => reject(new Error('上傳逾時'));

    xhr.timeout = 60_000;
    xhr.send(formData);
  });
}
