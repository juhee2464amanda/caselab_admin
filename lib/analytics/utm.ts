/**
 * UTM 파라미터 파싱 + sessionStorage 저장 + track wrapper 자동 병합
 *
 * 결정 출처: §19 D25 (UTM Builder) + D26 (utm_channel seed) + §18.10
 *
 * 흐름:
 *   1. 사용자가 ?utm_source=instagram&utm_medium=social&utm_campaign=xxx 로 진입
 *   2. <UtmCapture /> 컴포넌트가 mount 시 parseUtmFromSearch() → saveUtmToSession()
 *   3. 이후 track() 호출 시 attachUtmToMetadata()가 events.metadata에 자동 병합
 *   4. admin/utm 히스토리에서 events GROUP BY metadata->>'utm_campaign'으로 채널별 분석
 */

export type Utm = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
};

const SESSION_KEY = 'caselab_utm';

const KEYS: (keyof Utm)[] = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];

export function parseUtmFromSearch(search: string): Utm | null {
  if (!search) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const utm: Utm = {};
  let found = false;
  for (const k of KEYS) {
    const v = params.get(k);
    if (v) {
      utm[k] = v;
      found = true;
    }
  }
  return found ? utm : null;
}

export function saveUtmToSession(utm: Utm) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(utm));
  } catch {
    // sessionStorage 비활성 (시크릿 모드 등) — silent fail
  }
}

export function getUtm(): Utm {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Utm) : {};
  } catch {
    return {};
  }
}

export function clearUtm() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // silent
  }
}

/**
 * track() wrapper가 호출. events.metadata에 utm_* 자동 병합.
 */
export function attachUtmToMetadata(
  metadata: Record<string, unknown> = {}
): Record<string, unknown> {
  const utm = getUtm();
  return { ...utm, ...metadata }; // 명시 metadata가 utm을 override
}
