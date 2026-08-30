'use client';

import { useEffect, useMemo, useState } from 'react';
import { FocusPicker } from '@/components/admin/studio/FocusPicker';

// 모션 카드 실험실 — 3개 입구(이미지 효과 / 실영상 오버레이 / 템플릿)를 UI에서 실행해본다.
// 로컬 전용(렌더가 로컬 Playwright·ffmpeg를 쓴다). 발행 파이프라인과는 아직 분리.

type Preset = { id: string; title: string; kind: 'overlay' | 'card'; html: string };

const EFFECTS = [
  ['kenburns', '켄번즈 줌인'],
  ['zoomout', '줌아웃'],
  ['panleft', '팬 왼쪽'],
  ['panright', '팬 오른쪽'],
  ['scrolldown', '아래로 스크롤 (긴 스크린샷)'],
  ['scrollup', '위로 스크롤'],
  ['still', '정지 (포커스 깜빡임용)'],
] as const;

const ACCENTS = [
  ['', '기본'],
  ['cat-case', '케이스 블루'],
  ['cat-trend', '트렌드 바이올렛'],
  ['cat-tool', '도구 에메랄드'],
  ['cat-prompt', '프롬프트 오렌지'],
  ['cat-guide', '가이드 딥틸'],
] as const;

const inp = 'w-full rounded border border-ink/15 bg-white px-2 py-1.5 text-sm';
const lbl = 'block text-xs font-semibold text-ink/60 mt-3 mb-1';

export function MotionLab() {
  const [tab, setTab] = useState<'image' | 'video' | 'html'>('image');
  const [presets, setPresets] = useState<Preset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [resultPath, setResultPath] = useState('');

  // 공통 파라미터
  const [src, setSrc] = useState('');
  const [accent, setAccent] = useState('');
  const [duration, setDuration] = useState(5);
  const [title, setTitle] = useState('');
  const [sub, setSub] = useState('');
  // image 전용
  const [effect, setEffect] = useState('kenburns');
  const [focus, setFocus] = useState('');
  const [fit, setFit] = useState('cover');
  // video 전용
  const [overlayId, setOverlayId] = useState('');
  // html 전용
  const [presetId, setPresetId] = useState('');
  const [html, setHtml] = useState('');

  useEffect(() => {
    fetch('/api/motion-card')
      .then((r) => r.json())
      .then((d) => setPresets(d.presets ?? []))
      .catch(() => setError('프리셋 목록을 불러오지 못했습니다 (로컬에서만 동작)'));
  }, []);

  const overlays = useMemo(() => presets.filter((p) => p.kind === 'overlay'), [presets]);
  const cards = useMemo(() => presets.filter((p) => p.kind === 'card'), [presets]);

  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /** 드롭/선택된 파일을 서버 uploads로 올리고 src에 경로를 채운다 */
  const uploadFile = async (f: File) => {
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/motion-card/upload', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `업로드 실패(${res.status})`);
      setSrc(d.path);
      if (d.kind === 'video' && tab !== 'video') setTab('video');
      if (d.kind === 'image' && tab !== 'image') setTab('image');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  const pickPreset = (id: string) => {
    setPresetId(id);
    setHtml(presets.find((p) => p.id === id)?.html ?? '');
  };

  const run = async () => {
    setBusy(true);
    setError('');
    setResultUrl('');
    try {
      const body =
        tab === 'image'
          ? { mode: tab, src, effect, focus, fit, title, sub, accent, duration }
          : tab === 'video'
            ? { mode: tab, src, overlayId, title: overlayId ? '' : title, sub: overlayId ? '' : sub, accent, duration }
            : { mode: tab, html, accent, duration };
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
    <div className="p-4 sm:p-8 max-w-5xl">
      <h1 className="text-lg font-bold">모션 카드 실험실</h1>
      <p className="mt-1 text-xs text-ink/50">
        1080×1350 MP4를 만든다 · 로컬 전용 · 결과는 content/motion-cards/에 저장 — 발행은 아직 수동(파일 받아서 캐러셀에 첨부)
      </p>

      <div className="mt-4 flex gap-1">
        {(
          [
            ['image', '이미지 + 효과'],
            ['video', '실영상 + 오버레이'],
            ['html', '템플릿'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-t px-3 py-1.5 text-sm font-semibold ${tab === k ? 'bg-ink text-white' : 'bg-ink/5 text-ink/60'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 rounded-b-lg rounded-tr-lg border border-ink/10 p-4 sm:grid-cols-2">
        <div>
          {tab !== 'html' && (
            <>
              <label className={lbl}>{tab === 'image' ? '이미지 소스 (URL 또는 로컬 경로)' : '영상 소스 (로컬 경로 또는 URL)'}</label>
              <input className={inp} value={src} onChange={(e) => setSrc(e.target.value)} placeholder={tab === 'image' ? 'https://… 슬라이드 이미지 URL' : '~/Downloads/IMG_5702 2.MOV'} />
              {/* 끌어넣기 업로드 — 파일을 떨어뜨리면 서버에 저장되고 위 경로가 자동으로 채워진다 */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void uploadFile(f);
                }}
                onClick={() => document.getElementById('motion-file-input')?.click()}
                className={`mt-2 flex h-16 cursor-pointer items-center justify-center rounded border-2 border-dashed text-xs transition-colors ${dragOver ? 'border-ink bg-ink/5 text-ink' : 'border-ink/20 text-ink/40 hover:border-ink/40'}`}
              >
                {uploading ? '업로드 중…' : '여기에 영상·이미지를 끌어넣기 (또는 클릭해서 선택)'}
              </div>
              <input
                id="motion-file-input"
                type="file"
                accept="video/*,image/*,.mov,.mp4,.m4v,.webm,.mkv,.png,.jpg,.jpeg,.webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadFile(f);
                  e.target.value = '';
                }}
              />
            </>
          )}

          {tab === 'image' && (
            <>
              <label className={lbl}>효과</label>
              <select className={inp} value={effect} onChange={(e) => setEffect(e.target.value)}>
                {EFFECTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <label className={lbl}>포커스 깜빡임 영역 (선택)</label>
              {src.startsWith('http') ? (
                <FocusPicker
                  imageUrl={src}
                  value={focus}
                  onChange={(f) => {
                    setFocus(f);
                    if (f && effect !== 'still') setEffect('still');
                  }}
                />
              ) : (
                <input className={inp} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder='좌표 "x,y,w,h" (URL 소스를 넣으면 드래그로 지정 가능)' pattern="\d+,\d+,\d+,\d+" />
              )}
              <label className={lbl}>맞춤</label>
              <select className={inp} value={fit} onChange={(e) => setFit(e.target.value)}>
                <option value="cover">cover — 꽉 채움(잘림)</option>
                <option value="contain">contain — 전체 보임(여백)</option>
              </select>
            </>
          )}

          {tab === 'video' && (
            <>
              <label className={lbl}>오버레이 프리셋 (움직이는 자막·그래픽)</label>
              <select className={inp} value={overlayId} onChange={(e) => setOverlayId(e.target.value)}>
                <option value="">없음 — 아래 제목/부제를 정적 스타일로</option>
                {overlays.map((p) => (
                  <option key={p.id} value={p.id}>{p.id} — {p.title}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-ink/45">오버레이 문구 수정은 아직 프리셋 파일에서 — scripts/motion-card/presets/{overlayId || '<id>'}.html</p>
            </>
          )}

          {tab === 'html' && (
            <>
              <label className={lbl}>템플릿 프리셋</label>
              <select className={inp} value={presetId} onChange={(e) => pickPreset(e.target.value)}>
                <option value="">선택…</option>
                {cards.map((p) => (
                  <option key={p.id} value={p.id}>{p.id} — {p.title}</option>
                ))}
              </select>
              <label className={lbl}>HTML (문구를 바로 고쳐서 렌더)</label>
              <textarea
                className={`${inp} h-64 font-mono text-[11px] leading-4`}
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                placeholder="프리셋을 선택하면 원문이 로드됩니다"
              />
            </>
          )}

          {tab !== 'html' && (
            <>
              <label className={lbl}>제목 (선택)</label>
              <input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={'줄바꿈은 \\n'} disabled={tab === 'video' && !!overlayId} />
              <label className={lbl}>부제 (선택)</label>
              <input className={inp} value={sub} onChange={(e) => setSub(e.target.value)} disabled={tab === 'video' && !!overlayId} />
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>카테고리 색</label>
              <select className={inp} value={accent} onChange={(e) => setAccent(e.target.value)}>
                {ACCENTS.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>길이(초)</label>
              <input className={inp} type="number" min={2} max={20} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
          </div>

          <button
            onClick={run}
            disabled={busy}
            className="mt-5 rounded bg-ink px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy ? '렌더 중… (30초~3분)' : 'MP4 생성'}
          </button>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>

        <div>
          <div className="text-xs font-semibold text-ink/60 mt-3 mb-1">미리보기</div>
          {resultUrl ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video key={resultUrl} src={resultUrl} controls autoPlay loop className="w-full max-w-[320px] rounded-lg border border-ink/10 bg-black" />
              <p className="mt-2 break-all text-[11px] text-ink/45">{resultPath}</p>
            </>
          ) : (
            <div className="flex aspect-[4/5] w-full max-w-[320px] items-center justify-center rounded-lg border border-dashed border-ink/20 text-xs text-ink/40">
              {busy ? '렌더 중…' : '결과가 여기 표시됩니다'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
