'use client';

import { useEffect, useState } from 'react';
import { FocusPicker } from '@/components/admin/studio/FocusPicker';

// 슬라이드 밑에 붙는 모션 효과 패널 — 검수 화면에서 슬라이드를 보면서
// ① 그 슬라이드의 이미지에 효과(스크롤·시네마틱 포커스·켄번즈)를 지정하거나
// ② 영상·이미지를 끌어넣어 그 소스로 만든다(영상이면 오버레이 프리셋 합성).
// 렌더는 로컬 전용(/api/motion-card). 결과는 파일로 받는 단계(발행 자동 연동 아직 없음).

const EFFECTS = [
  ['terminal-typing', '터미널 타이핑 — 이미지 텍스트가 실제로 쳐짐 (자동 추출)'],
  ['scrolldown', '아래로 스크롤 — 긴 스크린샷 훑기'],
  ['scrollup', '위로 스크롤'],
  ['still', '시네마틱 포커스 (영역 드래그)'],
  ['kenburns', '켄번즈 줌인'],
  ['zoomout', '줌아웃'],
  ['panleft', '팬 왼쪽'],
  ['panright', '팬 오른쪽'],
] as const;

type Overlay = { id: string; title: string };

export function SlideMotionPanel({
  imageUrl,
  accent,
  slideNo,
  motionUrl,
  onAttach,
  slide,
}: {
  imageUrl: string | null;
  accent: string; // cat-* (카드 카테고리색 그대로)
  slideNo: number;
  /** 슬라이드 원본 — 있으면 카드 레이아웃 유지 + 이미지 슬롯에만 모션 합성(composite) */
  slide?: { template: string; props: Record<string, unknown> };
  /** 이미 적용된 모션 영상 공개 URL (slides[i].motion.url) */
  motionUrl?: string | null;
  /** 생성물을 슬라이드에 적용(공개 URL 전달) / null이면 해제 */
  onAttach?: (url: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [effect, setEffect] = useState('scrolldown');
  const [focus, setFocus] = useState('');
  const [fit, setFit] = useState('cover');
  const [duration, setDuration] = useState(6);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [resultPath, setResultPath] = useState('');
  // 끌어넣은 소스 — serverPath는 렌더용, previewUrl(objectURL)은 화면 표시용
  const [upload, setUpload] = useState<{ path: string; kind: 'image' | 'video'; previewUrl: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [overlayId, setOverlayId] = useState('');
  // 자연어 해석 — "노란색 부분이 깜빡이게" 같은 문장을 AI가 파라미터로 변환
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  /** terminal-typing용 — AI 해석이 이미지에서 읽어온 줄들 */
  const [typingLines, setTypingLines] = useState<string[]>([]);

  useEffect(() => {
    if (!open || overlays.length) return;
    fetch('/api/motion-card')
      .then((r) => r.json())
      .then((d) => setOverlays((d.presets ?? []).filter((p: { kind: string }) => p.kind === 'overlay')))
      .catch(() => {});
  }, [open, overlays.length]);

  // 이미지 슬롯 없는 템플릿도 끌어넣기로는 쓸 수 있어야 하므로 패널은 항상 그린다
  const srcKind = upload?.kind ?? (imageUrl ? 'image' : null);
  const displayImage = upload?.kind === 'image' ? upload.previewUrl : imageUrl;

  const uploadFile = async (f: File) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/motion-card/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `업로드 실패(${res.status})`);
      setUpload({ path: d.path, kind: d.kind, previewUrl: URL.createObjectURL(f), name: f.name });
      setFocus('');
      setResultUrl('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const [attaching, setAttaching] = useState(false);

  /** 결과 MP4를 공개 버킷에 올리고 슬라이드에 연결 — 발행 시 이 칸이 영상으로 나간다 */
  const attach = async () => {
    if (!resultPath || !onAttach) return;
    setAttaching(true);
    setError('');
    try {
      const res = await fetch('/api/motion-card/attach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: resultPath }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `업로드 실패(${res.status})`);
      onAttach(d.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAttaching(false);
    }
  };

  /** 자연어 요청을 AI가 해석해 컨트롤에 채운다 (이미지면 실제로 보고 영역까지) */
  const interpret = async () => {
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    setError('');
    setAiNote('');
    try {
      const res = await fetch('/api/motion-card/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          kind: srcKind ?? 'image',
          src: upload?.path ?? imageUrl,
          fit,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `해석 실패(${res.status})`);
      if (d.kind === 'video') {
        setOverlayId(d.overlayId ?? '');
      } else {
        if (d.effect) setEffect(d.effect);
        setFocus(d.focus ?? '');
        setTypingLines(d.lines ?? []);
        if (d.duration) setDuration(d.duration);
      }
      setAiNote(d.note || '해석 완료 — 아래 설정 확인 후 생성하세요');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const body =
        srcKind === 'video' && upload
          ? slide && imageUrl
            ? // 끌어넣은 영상도 카드의 이미지 슬롯 자리에 — 텍스트·레이아웃 보존
              { mode: 'composite', slide, srcVideo: upload.path, accent, duration }
            : { mode: 'video', src: upload.path, overlayId, accent, duration }
          : !upload && slide && imageUrl
            ? // 카드 레이아웃은 그대로, 이미지 슬롯 자리에만 모션 합성
              { mode: 'composite', slide, effect, focus, accent, duration, lines: typingLines }
            : { mode: 'image', src: upload?.path ?? imageUrl, effect, focus, fit, accent, duration, lines: typingLines };
      const res = await fetch('/api/motion-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `렌더 실패(${res.status})`);
      setResultUrl(d.url);
      setResultPath(d.file);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-lg border border-border bg-ink/[0.02]">
      <button onClick={() => setOpen(!open)} className="w-full px-3 py-2 text-left text-xs font-semibold text-ink/60 hover:text-ink">
        🎬 모션 효과 {open ? '접기' : `— ${slideNo}번 슬라이드를 영상으로`}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-xs">
          {motionUrl && (
            <div className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="text-emerald-700">🎬 모션 적용됨 — 발행 시 이 칸은 영상으로 나갑니다 (저장 필수)</span>
                {onAttach && (
                  <button onClick={() => onAttach(null)} className="text-emerald-700 underline">해제</button>
                )}
              </div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={motionUrl} muted loop autoPlay controls className="mt-1.5 w-full max-w-[220px] rounded border border-emerald-200 bg-black" />
            </div>
          )}

          {/* 자연어로 쓰면 AI가 해석 — 효과·영역·길이를 채워준다 */}
          <div className="flex gap-2">
            <input
              className="flex-1 rounded border border-border bg-white px-2 py-1.5"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void interpret(); }}
              placeholder='원하는 효과를 자유롭게 — 예: "노란색 셀이 깜빡이게" "아래로 천천히 스크롤"'
            />
            <button onClick={interpret} disabled={aiBusy || !aiPrompt.trim()} className="shrink-0 rounded border border-ink/20 px-3 py-1.5 font-bold disabled:opacity-40">
              {aiBusy ? '해석 중…' : 'AI 해석'}
            </button>
          </div>
          {aiNote && <p className="text-emerald-700">✓ {aiNote}</p>}

          {/* 끌어넣기 — 슬라이드 이미지 대신 직접 소스를 쓸 때 */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void uploadFile(f);
            }}
            onClick={() => document.getElementById(`motion-file-${slideNo}`)?.click()}
            className={`flex h-12 cursor-pointer items-center justify-center rounded border-2 border-dashed transition-colors ${dragOver ? 'border-ink bg-ink/5 text-ink' : 'border-border text-ink/40 hover:border-ink/30'}`}
          >
            {uploading ? '업로드 중…' : upload ? `소스: ${upload.name} (다시 끌어넣으면 교체)` : imageUrl ? '영상·이미지 끌어넣기 — 안 넣으면 슬라이드 이미지 사용' : '이 슬라이드는 이미지가 없어요 — 영상·이미지를 끌어넣어 시작'}
          </div>
          <input
            id={`motion-file-${slideNo}`}
            type="file"
            accept="video/*,image/*,.mov,.mp4,.m4v,.webm,.mkv,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
              e.target.value = '';
            }}
          />
          {upload && (
            <button onClick={() => setUpload(null)} className="text-[10px] text-ink/40 underline">
              끌어넣은 소스 지우고 슬라이드 이미지로
            </button>
          )}

          {srcKind === 'video' ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video src={upload!.previewUrl} muted loop autoPlay className="w-full max-w-[200px] rounded border border-border bg-black" />
              {slide && imageUrl ? (
                <p className="text-emerald-700">이 영상은 카드의 이미지 영역에 맞춰 들어갑니다 — 텍스트·레이아웃은 유지돼요.</p>
              ) : (
                <select className="w-full rounded border border-border bg-white px-2 py-1.5" value={overlayId} onChange={(e) => setOverlayId(e.target.value)}>
                  <option value="">오버레이 없음 — 카드 규격 크롭만</option>
                  {overlays.map((o) => (
                    <option key={o.id} value={o.id}>{o.id} — {o.title}</option>
                  ))}
                </select>
              )}
            </>
          ) : srcKind === 'image' ? (
            <>
              <div className="flex gap-2">
                <select className="flex-1 rounded border border-border bg-white px-2 py-1.5" value={effect} onChange={(e) => setEffect(e.target.value)}>
                  {EFFECTS.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
                <select className="rounded border border-border bg-white px-2 py-1.5" value={fit} onChange={(e) => setFit(e.target.value)}>
                  <option value="cover">cover</option>
                  <option value="contain">contain</option>
                </select>
              </div>
              {displayImage && (
                <FocusPicker
                  imageUrl={displayImage}
                  value={focus}
                  onChange={(f) => {
                    setFocus(f);
                    // 이미지가 움직이면 영역 좌표가 어긋나므로, 영역을 찍으면 포커스 효과로 전환
                    if (f && effect !== 'still') setEffect('still');
                  }}
                />
              )}
            </>
          ) : null}

          {srcKind && (
            <div className="flex items-center gap-3">
              <label className="text-ink/50">길이(초)</label>
              <input type="number" min={2} max={20} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-16 rounded border border-border bg-white px-2 py-1.5" />
              <button onClick={run} disabled={busy} className="rounded bg-ink px-3 py-1.5 font-bold text-white disabled:opacity-40">
                {busy ? '렌더 중… (30초~2분)' : 'MP4 생성'}
              </button>
            </div>
          )}
          {error && <p className="text-red-600">{error}</p>}
          {resultUrl && (
            <div>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video key={resultUrl} src={resultUrl} controls autoPlay loop className="w-full max-w-[280px] rounded border border-border bg-black" />
              <div className="mt-1 flex items-center gap-2">
                {onAttach && (
                  <button onClick={attach} disabled={attaching} className="rounded bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:opacity-40">
                    {attaching ? '적용 중…' : '이 슬라이드에 적용'}
                  </button>
                )}
                <p className="break-all text-[10px] text-ink/40">{resultPath}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
