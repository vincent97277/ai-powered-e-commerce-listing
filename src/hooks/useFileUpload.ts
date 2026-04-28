'use client';

/**
 * useFileUpload — 把整個直傳流程包成一個 hook
 *
 * Flow:
 *   idle → signing  → uploading (有 progress) → processing → done
 *                                                          ↘ error
 *
 * 為何用 XMLHttpRequest 而非 fetch:
 *   fetch 在瀏覽器目前還沒有原生 upload progress event (ReadableStream
 *   的 progress polyfill 太脆弱)，XHR 的 upload.onprogress 是最穩的選擇。
 */

import { useCallback, useRef, useState } from 'react';
import {
  signUploadUrl,
  triggerIngest,
} from '@/app/(merchant)/merchant/products/new/actions';

export type UploadState =
  | 'idle'
  | 'signing'
  | 'uploading'
  | 'processing'
  | 'done'
  | 'error';

export interface UseFileUploadReturn {
  state: UploadState;
  /** 0-100，只在 uploading 階段有意義 */
  progress: number;
  /** 失敗時的錯誤訊息，給 UI 顯示用 */
  error: string | null;
  /** 上傳成功會回 { key }，失敗回 null (UI 從 error state 拿訊息) */
  upload: (file: File) => Promise<{ key: string } | null>;
  reset: () => void;
}

export function useFileUpload(): UseFileUploadReturn {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // 用 ref 追進行中 XHR，方便之後做 cancel (hackathon 沒接 UI，但留鉤子)
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

        // ---------- step 1: 跟 server 拿 presigned URL ----------
        setState('signing');
        const signed = await signUploadUrl({
          contentType: file.type,
          fileSize: file.size,
        });
        if (!signed.success) {
          setError(signed.error);
          setState('error');
          return null;
        }

        // ---------- step 2: PUT 直傳 R2 (帶 progress) ----------
        setState('uploading');
        await putWithProgress({
          url: signed.uploadUrl,
          file,
          onProgress: (pct) => setProgress(pct),
          xhrRef,
        });

        // ---------- step 3: 通知 Inngest 開始處理 ----------
        setState('processing');
        const ingest = await triggerIngest({ r2Key: signed.key });
        if (!ingest.ingested) {
          setError('觸發背景處理失敗，請重試');
          setState('error');
          return null;
        }

        setState('done');
        return { key: signed.key };
      } catch (err) {
        // XHR abort / network error / timeout 全部走這裡
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

// ---------- 內部 helper: XHR PUT with progress ----------

function putWithProgress(opts: {
  url: string;
  file: File;
  onProgress: (pct: number) => void;
  xhrRef: React.MutableRefObject<XMLHttpRequest | null>;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    opts.xhrRef.current = xhr;

    xhr.open('PUT', opts.url, true);
    // 重要: Content-Type 必須跟 presign 時的 contentType 一致，
    // 否則 R2 會回 SignatureDoesNotMatch。瀏覽器會用 file.type，
    // 而我們 sign 時也用 file.type，理論上一致。
    xhr.setRequestHeader('Content-Type', opts.file.type);

    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      opts.onProgress(pct);
    };

    xhr.onload = () => {
      // R2 PUT 成功是 200 (有時 204)，其他都當失敗
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(
          new Error(
            `R2 上傳失敗 (HTTP ${xhr.status}): ${xhr.responseText?.slice(0, 200) ?? ''}`,
          ),
        );
      }
    };

    xhr.onerror = () =>
      reject(new Error('網路錯誤 (CORS 沒設好? R2 endpoint 不對?)'));
    xhr.onabort = () => reject(new Error('上傳已取消'));
    xhr.ontimeout = () => reject(new Error('上傳逾時'));

    // 60 秒 timeout (10MB on 4G 大概 20-30 秒，留 buffer)
    xhr.timeout = 60_000;

    xhr.send(opts.file);
  });
}
