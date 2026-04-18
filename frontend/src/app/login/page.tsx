'use client';

import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { guestService } from '@/services/guestService';
import { useLanguage } from '@/context/LanguageContext';
import { usePdf } from '@/context/PdfContext';

import Popup from '@/components/ui/Popup';
import { usePopup } from '@/hooks/usePopup';
import { InputOTP6 } from '@/components/ui/input-otp';
import { resolveApiBaseUrl } from '@/utils/api';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t } = useLanguage();
  const { savePdf } = usePdf();

  const { popup, showError, showSuccess, close } = usePopup();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'password' | 'otp'>('password');
  const [tempToken, setTempToken] = useState('');
  const [otp, setOtp] = useState('');

  useEffect(() => {
    savePdf(null as any);
  }, []);

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/');
    }
  }, [status, router]);

  const handleGoogleLogin = async () => {
    try {
      await signIn('google', { callbackUrl: '/' });
      await guestService.clearSession();
    } catch (error) {
      console.error(error);
      showError(t('loginError'));
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const base = resolveApiBaseUrl();
      const res = await fetch(`${base}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        status?: string;
        temp_token?: string;
        detail?: unknown;
      };

      if (res.status === 429) {
        showError(t('loginError'));
        return;
      }

      if (!res.ok) {
        const detail = data.detail;
        showError(
          typeof detail === 'string' && detail.trim() ? detail : t('loginError')
        );
        return;
      }

      if (data.status === 'requires_2fa' && data.temp_token) {
        setTempToken(data.temp_token);
        setStep('otp');
        setOtp('');
        return;
      }

      showError(t('loginError'));
    } catch {
      showError(t('loginError'));
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      showError(t('loginOtpInvalid'));
      return;
    }
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        redirect: false,
        email,
        otpCode: otp,
        tempToken,
      });

      if (result?.error) {
        showError(t('loginOtpInvalid'));
      } else {
        showSuccess(t('loginSuccess'));
        await guestService.clearSession();
        router.push('/');
      }
    } catch {
      showError(t('loginOtpInvalid'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
      <div className="w-full max-w-md">
        <div
          className="rounded-2xl shadow-xl p-8 border border-[var(--container-border)]"
          style={{ backgroundColor: 'var(--container-bg)' }}
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold tracking-tight mb-2">
              {t('appTitle')}
            </h1>
            <p className="opacity-70 font-medium">
              {step === 'password' ? t('loginTitle') : t('loginOtpTitle')}
            </p>
            {step === 'otp' && (
              <p className="mt-2 text-sm opacity-80">
                {t('loginOtpDescription')}
              </p>
            )}
          </div>

          {step === 'password' ? (
            <form className="space-y-4" onSubmit={handlePasswordSubmit}>
              <input
                type="email"
                placeholder={t('email')}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all bg-[var(--background)] text-[var(--foreground)] placeholder-gray-400"
                style={
                  {
                    borderColor: 'var(--navbar-border)',
                    '--tw-ring-color': 'var(--button-bg)',
                  } as React.CSSProperties
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <input
                type="password"
                placeholder={t('password')}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 transition-all bg-[var(--background)] text-[var(--foreground)] placeholder-gray-400"
                style={
                  {
                    borderColor: 'var(--navbar-border)',
                    '--tw-ring-color': 'var(--button-bg)',
                  } as React.CSSProperties
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-3 font-bold rounded-xl shadow-md transition-transform hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--button-text)',
                }}
              >
                {loading ? t('loginButtonLoading') : t('loginButton')}
              </button>
            </form>
          ) : (
            <form className="space-y-6" onSubmit={handleOtpSubmit}>
              <div className="flex flex-col items-center gap-2">
                <InputOTP6
                  value={otp}
                  onChange={setOtp}
                  disabled={loading}
                  aria-label={t('loginOtpTitle')}
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full px-4 py-3 font-bold rounded-xl shadow-md transition-transform hover:scale-105 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--button-bg)',
                  color: 'var(--button-text)',
                }}
              >
                {loading ? t('loginOtpLoading') : t('loginOtpVerify')}
              </button>
              <button
                type="button"
                className="w-full text-sm font-semibold opacity-80 hover:opacity-100"
                onClick={() => {
                  setStep('password');
                  setTempToken('');
                  setOtp('');
                }}
              >
                {t('loginOtpBack')}
              </button>
            </form>
          )}

          {step === 'password' && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--navbar-border)]"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span
                    className="px-2 font-medium opacity-60"
                    style={{ backgroundColor: 'var(--container-bg)' }}
                  >
                    {t('or')}
                  </span>
                </div>
              </div>

              <button onClick={handleGoogleLogin} className="btn-google">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                {t('googleLogin')}
              </button>

              <div className="mt-6 text-center">
                <button
                  onClick={() => router.push('/register')}
                  className="text-sm font-semibold hover:underline opacity-80 hover:opacity-100 transition-opacity"
                >
                  {t('noAccount')}{' '}
                  <span style={{ color: 'var(--button-bg)' }}>
                    {t('createAccount')}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <Popup
        type={popup.type}
        message={popup.message}
        open={popup.open}
        onClose={close}
      />
    </main>
  );
}
