// lib/claude-cli.ts
// 구독 OAuth(로컬 Claude CLI)로 AI를 호출하는 래퍼.
// ANTHROPIC_API_KEY(종량과금) 대신, 로컬에 로그인된 Claude Code 구독을 사용 → 토큰비용 0원.
// 앱이 내 Mac(= claude CLI가 깔리고 로그인된 환경)에서 돌 때만 동작한다. (③ 로컬 작업장 모델)
//
// 호출: claude -p --output-format json --model opus --append-system-prompt <sys> --allowedTools WebSearch WebFetch
//   - 프롬프트는 stdin으로 전달(긴 프롬프트/이스케이프 안전, --allowedTools 변수인자와의 충돌 회피).
//   - print 모드라 allowlist에 없는 도구는 자동 거부(프롬프트 없음).
//   - cwd를 임시 디렉터리로 두어 프로젝트 설정/MCP 간섭을 줄인다.

import { spawn } from 'child_process';
import { tmpdir } from 'os';

export interface ClaudeCliOptions {
  /** append-system-prompt 로 들어갈 시스템 지시문 */
  system: string;
  /** stdin 으로 전달할 사용자 프롬프트 */
  prompt: string;
  /** 허용 도구. 기본: 리서치 초안을 위해 WebSearch/WebFetch */
  allowedTools?: string[];
  /** 모델 별칭/이름. 기본 'opus'(최신) */
  model?: string;
  /** 타임아웃(ms). 기본 180s — 리서치 포함이라 넉넉히. 로컬이라 플랫폼 타임아웃 없음 */
  timeoutMs?: number;
}

/** Claude CLI를 구독 인증으로 실행하고 최종 응답 텍스트(.result)를 반환한다. */
export async function runClaudeSubscription(opts: ClaudeCliOptions): Promise<string> {
  const bin = process.env.CLAUDE_CLI_PATH || 'claude';
  const tools = opts.allowedTools ?? ['WebSearch', 'WebFetch'];
  const timeoutMs = opts.timeoutMs ?? 180_000;

  const args = [
    '-p',
    '--output-format',
    'json',
    '--model',
    opts.model ?? 'opus',
    '--append-system-prompt',
    opts.system,
    // 도구가 있을 때만 allowlist 부여. 빈 배열이면 플래그 자체를 빼서(값 없는 --allowedTools 오류 방지)
    // 아무 도구도 안 쓰게 한다 → 채점처럼 웹서치 불필요한 호출을 빠르게.
    ...(tools.length ? ['--allowedTools', ...tools] : []),
  ];

  return new Promise<string>((resolve, reject) => {
    let child;
    try {
      child = spawn(bin, args, {
        cwd: tmpdir(),
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      reject(new Error(`Claude CLI 실행 실패(${bin}): ${(e as Error).message}`));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(new Error(`Claude CLI 타임아웃(${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error(`Claude CLI 오류(${bin}): ${e.message}. CLAUDE_CLI_PATH 설정/로그인 상태를 확인하세요.`));
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Claude CLI 종료코드 ${code}: ${stderr.slice(0, 500) || stdout.slice(0, 500)}`));
        return;
      }
      try {
        const envelope = JSON.parse(stdout);
        // --output-format json 봉투: { type:'result', is_error, result, ... }
        if (envelope?.is_error) {
          reject(new Error(`Claude CLI 결과 오류: ${envelope.result ?? '(no result)'}`));
          return;
        }
        const text = typeof envelope?.result === 'string' ? envelope.result : '';
        if (!text) {
          reject(new Error('Claude CLI 응답이 비었어요'));
          return;
        }
        resolve(text);
      } catch (e) {
        reject(new Error(`Claude CLI 응답 파싱 실패: ${(e as Error).message}. raw: ${stdout.slice(0, 300)}`));
      }
    });

    child.stdin.write(opts.prompt);
    child.stdin.end();
  });
}

/**
 * 모델 응답에서 JSON 객체만 추출. 코드펜스(```json)·프롤로그 프로즈·본문 속 내부 ``` 펜스에
 * 영향받지 않도록, 첫 '{'부터 문자열 상태를 추적하며 균형 잡힌 객체를 스캔한다.
 * (기존 non-greedy 펜스 정규식은 본문에 코드펜스가 있으면 JSON을 잘라 파싱 실패를 냈다.)
 */
export function extractJson(raw: string): string {
  const start = raw.indexOf('{');
  if (start === -1) return raw;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return raw.slice(start); // 균형이 안 맞으면(잘림 등) 남은 부분 그대로 — 상위 sanitizer가 복구 시도
}
