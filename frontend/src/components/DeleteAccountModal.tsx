'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from 'next-auth';
import { signOut } from 'next-auth/react';
import { translations } from '@/utils/translations';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  requestAccountDeletionOtp,
  verifyAndDeleteAccountWithOtp,
  verifyAndDeleteAccountWithPassword,
} from '@/services/accountDeletionService';

const RESEND_COOLDOWN_SECONDS = 60;

export interface DeleteAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  t: (key: keyof (typeof translations)['tr']) => string;
}

export function DeleteAccountModal({ isOpen, onClose, session, t }: DeleteAccountModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldownSeconds, setResendCooldownSeconds] = useState(0);
  const [acknowledge, setAcknowledge] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const deleteInFlightRef = useRef(false);

  const { data: me, error: meError, isLoading: providerLoading } = useCurrentUser(isOpen);

  const providerError = useMemo(() => {
    if (!meError) return '';
    if (meError instanceof Error) return meError.message;
    if (typeof meError === 'object' && meError !== null && 'message' in meError) {
      return String((meError as { message: unknown }).message);
    }
    return t('error') || 'Error';
  }, [meError, t]);

  const provider = useMemo(() => {
    if (!isOpen || providerLoading || meError) return null;
    if (!me) return null;
    return typeof me.provider === 'string' ? me.provider : 'local';
  }, [isOpen, providerLoading, meError, me]);

  useEffect(() => {
    if (resendCooldownSeconds <= 0) return undefined;
    const id = window.setTimeout(() => {
      setResendCooldownSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [resendCooldownSeconds]);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setOtp('');
      setOtpSent(false);
      setResendCooldownSeconds(0);
      setAcknowledge(false);
      setInlineError('');
      setIsDeleting(false);
      setSendingOtp(false);
      deleteInFlightRef.current = false;
    }
  }, [isOpen]);

  const handleCancel = () => {
    setPassword('');
    setOtp('');
    setInlineError('');
    onClose();
  };

  const requestOtp = async () => {
    if (!session?.user || sendingOtp) return;
    if (otpSent && resendCooldownSeconds > 0) return;
    setSendingOtp(true);
    setInlineError('');
    try {
      await requestAccountDeletionOtp();
      setOtpSent(true);
      setResendCooldownSeconds(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setInlineError(e instanceof Error ? e.message : t('deleteAccountError') || 'Error');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!session?.user || deleteInFlightRef.current) return;
    if (!acknowledge) {
      setInlineError(t('deleteAccountAcknowledgeRequired') || 'Lütfen onay kutusunu işaretleyin.');
      return;
    }
    setInlineError('');

    if (provider === 'local') {
      const trimmed = password.trim();
      if (!trimmed) {
        setInlineError(t('deleteAccountPasswordRequired') || 'Hesabı silmek için şifrenizi girin.');
        return;
      }
      deleteInFlightRef.current = true;
      setIsDeleting(true);
      try {
        await verifyAndDeleteAccountWithPassword(trimmed);
        onClose();
        await signOut({ callbackUrl: '/' });
      } catch (e) {
        setInlineError(e instanceof Error ? e.message : t('deleteAccountError') || 'Error');
        deleteInFlightRef.current = false;
        setIsDeleting(false);
      }
      return;
    }

    if (provider !== null && provider !== 'local') {
      const otpDigits = otp.replace(/\s/g, '').trim();
      if (!otpSent) {
        setInlineError(t('deleteAccountSendCodeFirst') || 'Önce doğrulama kodu gönderin.');
        return;
      }
      if (otpDigits.length !== 6) {
        setInlineError(t('deleteAccountOtpInvalid') || '6 haneli kod girin.');
        return;
      }
      deleteInFlightRef.current = true;
      setIsDeleting(true);
      try {
        await verifyAndDeleteAccountWithOtp(otpDigits);
        onClose();
        await signOut({ callbackUrl: '/' });
      } catch (e) {
        setInlineError(e instanceof Error ? e.message : t('deleteAccountError') || 'Error');
        deleteInFlightRef.current = false;
        setIsDeleting(false);
      }
    }
  };

  if (!isOpen) return null;

  const isLocal = provider === 'local';
  const isOAuth = provider !== null && provider !== '' && provider !== 'local';
  const credentialsReady = isLocal
    ? password.trim().length > 0
    : otpSent && otp.replace(/\s/g, '').length === 6;
  const deleteDisabled =
    isDeleting ||
    sendingOtp ||
    providerLoading ||
    !!providerError ||
    provider === null ||
    !credentialsReady;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
      <div className="bg-[var(--container-bg)] rounded-2xl shadow-2xl max-w-md w-full border border-[var(--navbar-border)] p-6">
        <div className="text-center">
          <h3 className="text-xl font-bold mb-2">
            {t('deleteAccountTitle') || 'Hesabınızı Silmek İstiyor musunuz?'}
          </h3>
          <p className="text-sm opacity-60 mb-4">
            {t('deleteAccountWarning') || 'Bu işlem geri alınamaz.'}
          </p>

          {providerLoading ? (
            <p className="text-sm opacity-80 mb-4">
              {t('deleteAccountLoadingProfile') || 'Yükleniyor…'}
            </p>
          ) : null}

          {providerError ? (
            <p className="text-sm text-red-500 mb-4" role="alert">
              {providerError}
            </p>
          ) : null}

          {inlineError ? (
            <p className="text-sm text-red-500 mb-4" role="alert">
              {inlineError}
            </p>
          ) : null}

          {!providerLoading && !providerError && provider !== null ? (
            <>
              {isLocal ? (
                <>
                  <label className="block text-left text-sm font-medium mb-1 opacity-90">
                    {t('deleteAccountPasswordLabel') || 'Şifrenizi doğrulayın'}
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('deleteAccountPasswordPlaceholder') || 'Hesap şifreniz'}
                    disabled={isDeleting}
                    className="w-full rounded-lg border border-[var(--navbar-border)] bg-[var(--container-bg)] px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:opacity-50"
                  />
                </>
              ) : isOAuth ? (
                <div className="text-left mb-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => void requestOtp()}
                    disabled={sendingOtp || isDeleting || (otpSent && resendCooldownSeconds > 0)}
                    className="w-full rounded-lg border border-[var(--navbar-border)] bg-[var(--container-bg)] px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sendingOtp
                      ? t('loading') || '…'
                      : otpSent && resendCooldownSeconds > 0
                        ? (t('deleteAccountResendInSeconds') || '({n}s)').replace(
                            '{n}',
                            String(resendCooldownSeconds),
                          )
                        : otpSent
                          ? t('deleteAccountResendCode') || 'Tekrar gönder'
                          : t('deleteAccountSendCode') || 'Kod gönder'}
                  </button>
                  {otpSent ? (
                    <>
                      <p className="text-xs opacity-70">
                        {t('deleteAccountOtpSentHint') || 'E-postanıza kod gönderildi.'}
                      </p>
                      <label className="block text-sm font-medium opacity-90">
                        {t('deleteAccountOtpLabel') || 'Kod'}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={12}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                        placeholder={t('deleteAccountOtpPlaceholder') || '000000'}
                        disabled={isDeleting}
                        className="w-full rounded-lg border border-[var(--navbar-border)] bg-[var(--container-bg)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:opacity-50"
                      />
                    </>
                  ) : null}
                </div>
              ) : null}

              <label className="flex items-start gap-2 text-left text-sm mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                  disabled={isDeleting}
                  className="mt-1 rounded border-[var(--navbar-border)]"
                />
                <span className="opacity-90">
                  {t('deleteAccountAcknowledge') || 'Hesabımı kalıcı olarak silmek istiyorum.'}
                </span>
              </label>
            </>
          ) : null}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isDeleting}
            className="btn-secondary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('cancel') || 'Vazgeç'}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirmDelete()}
            disabled={deleteDisabled}
            className="btn-danger flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? t('deletingAccount') || 'Siliniyor…' : t('confirmDelete') || 'Sil'}
          </button>
        </div>
      </div>
    </div>
  );
}
