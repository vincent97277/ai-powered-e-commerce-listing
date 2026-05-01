/**
 * V1.6 Track B4 — feedback state primitives smoke tests
 *
 * 測 5 components: StateSurface / EmptyState / LoadingState / ErrorState / PartialState.
 *
 * Vitest runs in `node` env (per vitest.config.ts) — no jsdom, no @testing-library/react.
 * 用 renderToStaticMarkup 做 server-render snapshot smoke tests:
 *   - 確認 component compiles + renders without throwing
 *   - 確認 markup 含預期的 a11y attributes / brand tokens / text
 *
 * Coverage:
 *   - EmptyState renders icon + title + body + 2 CTAs
 *   - LoadingState skeleton renders N rows
 *   - LoadingState spinner has aria-busy="true"
 *   - ErrorState renders error message (string)
 *   - ErrorState renders error.message (Error instance)
 *   - PartialState lists all failed sections
 *   - StateSurface scope='page' has different padding than scope='inline'
 *   - tone='brand' uses var(--brand-primary), tone='neutral' does NOT add primary tint
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Search, FileX, Inbox } from 'lucide-react';

import { StateSurface } from '@/components/feedback/StateSurface';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PartialState } from '@/components/feedback/PartialState';

describe('StateSurface', () => {
  it('scope="page" has different padding class than scope="inline"', () => {
    const pageHtml = renderToStaticMarkup(
      <StateSurface scope="page">
        <span>x</span>
      </StateSurface>,
    );
    const inlineHtml = renderToStaticMarkup(
      <StateSurface scope="inline">
        <span>x</span>
      </StateSurface>,
    );
    expect(pageHtml).toContain('py-16');
    expect(pageHtml).toContain('justify-center');
    expect(inlineHtml).toContain('py-4');
    expect(inlineHtml).not.toContain('py-16');
  });

  it('tone="brand" tints with var(--brand-primary); tone="neutral" does not', () => {
    const brandHtml = renderToStaticMarkup(
      <StateSurface tone="brand">
        <span>x</span>
      </StateSurface>,
    );
    const neutralHtml = renderToStaticMarkup(
      <StateSurface tone="neutral">
        <span>x</span>
      </StateSurface>,
    );
    // brand tone applies a tint backed by --brand-primary
    expect(brandHtml).toContain('--brand-primary');
    expect(brandHtml).toContain('data-tone="brand"');
    // neutral does NOT add a brand-primary tint (only color: var(--brand-text))
    expect(neutralHtml).not.toContain('--brand-primary');
    expect(neutralHtml).toContain('data-tone="neutral"');
  });

  it('default scope is "section" and default tone is "neutral"', () => {
    const html = renderToStaticMarkup(
      <StateSurface>
        <span>x</span>
      </StateSurface>,
    );
    expect(html).toContain('data-scope="section"');
    expect(html).toContain('data-tone="neutral"');
  });
});

describe('EmptyState', () => {
  it('renders icon + title + body + 2 CTAs', () => {
    const html = renderToStaticMarkup(
      <EmptyState
        icon={Search}
        title="找不到符合的商家"
        body="請放寬篩選條件再試一次"
        primaryCTA={{ label: '清除篩選', href: '/admin' }}
        secondaryCTA={{ label: '回首頁', href: '/' }}
      />,
    );
    expect(html).toContain('找不到符合的商家');
    expect(html).toContain('請放寬篩選條件再試一次');
    expect(html).toContain('清除篩選');
    expect(html).toContain('回首頁');
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="/"');
    // icon at 48px
    expect(html).toContain('width="48"');
    expect(html).toContain('height="48"');
    // role="status" on inner block
    expect(html).toContain('role="status"');
  });

  it('renders without CTAs when none provided', () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={Inbox} title="尚無資料" />,
    );
    expect(html).toContain('尚無資料');
    expect(html).not.toContain('hover-lift inline-flex');
  });

  it('tone="brand" uses brand-primary for icon color', () => {
    const html = renderToStaticMarkup(
      <EmptyState icon={Search} title="x" tone="brand" />,
    );
    expect(html).toContain('var(--brand-primary)');
  });
});

describe('LoadingState', () => {
  it('skeleton variant renders N rows (default 3)', () => {
    const html = renderToStaticMarkup(<LoadingState variant="skeleton" />);
    // 3 animate-pulse rows
    const matches = html.match(/animate-pulse/g);
    expect(matches?.length).toBe(3);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('載入中');
  });

  it('skeleton variant renders custom row count', () => {
    const html = renderToStaticMarkup(<LoadingState variant="skeleton" rows={7} />);
    const matches = html.match(/animate-pulse/g);
    expect(matches?.length).toBe(7);
  });

  it('spinner variant has aria-busy="true" and animate-spin', () => {
    const html = renderToStaticMarkup(<LoadingState variant="spinner" label="載入商家中" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('animate-spin');
    expect(html).toContain('載入商家中');
  });

  it('inline variant renders compact spinner with optional label', () => {
    const html = renderToStaticMarkup(<LoadingState variant="inline" label="處理中" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('animate-spin');
    expect(html).toContain('處理中');
  });
});

describe('ErrorState', () => {
  it('renders error message when error is a string', () => {
    const html = renderToStaticMarkup(
      <ErrorState error="資料庫連線中斷" />,
    );
    expect(html).toContain('出了點狀況');
    expect(html).toContain('資料庫連線中斷');
    expect(html).toContain('role="alert"');
  });

  it('renders error.message when error is an Error instance', () => {
    const err = new Error('Database timeout');
    const html = renderToStaticMarkup(<ErrorState error={err} />);
    expect(html).toContain('Database timeout');
    // stack trace is NOT shown — only message
    expect(html).not.toContain('at ');
  });

  it('renders retry + support link when both provided', () => {
    const html = renderToStaticMarkup(
      <ErrorState
        error="x"
        retryHref="/admin"
        supportHref="mailto:support@catalogify.com"
      />,
    );
    expect(html).toContain('href="/admin"');
    expect(html).toContain('href="mailto:support@catalogify.com"');
    expect(html).toContain('重試');
    expect(html).toContain('聯絡支援');
  });

  it('uses var(--error) for icon color', () => {
    const html = renderToStaticMarkup(<ErrorState error="x" />);
    expect(html).toContain('var(--error)');
  });
});

describe('PartialState', () => {
  it('lists all failed sections', () => {
    const html = renderToStaticMarkup(
      <PartialState failedSections={['銷售圖表', '近期訂單', 'AI 用量']} />,
    );
    expect(html).toContain('部分資料無法載入');
    expect(html).toContain('銷售圖表');
    expect(html).toContain('近期訂單');
    expect(html).toContain('AI 用量');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it('returns null when failedSections is empty', () => {
    const html = renderToStaticMarkup(<PartialState failedSections={[]} />);
    expect(html).toBe('');
  });

  it('uses var(--warning) for amber AlertTriangle', () => {
    const html = renderToStaticMarkup(
      <PartialState failedSections={['x']} />,
    );
    expect(html).toContain('var(--warning)');
  });
});

describe('feedback primitives — type/import smoke', () => {
  it('all 5 components are server-renderable without throwing', () => {
    expect(() =>
      renderToStaticMarkup(
        <div>
          <StateSurface scope="section">
            <span>shell</span>
          </StateSurface>
          <EmptyState icon={Search} title="x" />
          <LoadingState />
          <ErrorState error="boom" />
          <PartialState failedSections={['s1']} />
          <FileX width={16} height={16} />
        </div>,
      ),
    ).not.toThrow();
  });
});
