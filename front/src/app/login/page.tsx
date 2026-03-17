"use client";

import { useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, Suspense } from "react";

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
        <p className="text-sm text-[var(--text-secondary)]">로딩 중...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
      <div className="panel flex w-full max-w-sm flex-col items-center gap-6 p-8">
        <div className="flex flex-col items-center gap-2">
          <span className="eyebrow">Meeting Alignment AI</span>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            로그인
          </h1>
          <p className="text-center text-sm text-[var(--text-secondary)]">
            Google 계정으로 로그인하면
            <br />
            캘린더에서 회의를 가져올 수 있어요.
          </p>
        </div>

        <button
          onClick={() => signIn("google", { callbackUrl })}
          className="button-primary flex w-full items-center justify-center gap-3"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Google로 계속하기
        </button>

        <a href="/" className="text-xs text-[var(--text-tertiary)] hover:underline">
          로그인 없이 계속하기
        </a>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--bg-base)]">
          <p className="text-sm text-[var(--text-secondary)]">로딩 중...</p>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
