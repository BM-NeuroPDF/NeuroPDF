'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { Session } from 'next-auth';
import {
  uploadUserAvatar,
  generateUserAvatar,
  editUserAvatarWithReference,
  confirmUserAvatar,
} from '@/services/avatarService';
import { clearReferencePreview } from './avatarPreview';
import type { AvatarModalT } from './avatarTypes';

type SessionUserWithId = NonNullable<Session['user']> & { id?: string };

export function useAvatarFlow(
  isOpen: boolean,
  session: Session | null,
  onClose: () => void,
  onAvatarConfirmed: () => void | Promise<void>,
  t: AvatarModalT,
) {
  const [modalMode, setModalMode] = useState<'select' | 'generate'>('select');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [tempAvatarId, setTempAvatarId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const userId = (session?.user as SessionUserWithId | undefined)?.id || 'me';

  function resetFormFields() {
    setModalMode('select');
    setUploading(false);
    setGenerating(false);
    setConfirming(false);
    setPreviewImage(null);
    setTempAvatarId(null);
    setAiPrompt('');
    setReferenceImage(null);
    setReferencePreview(clearReferencePreview);
  }

  useEffect(() => {
    if (isOpen) {
      resetFormFields();
      return undefined;
    }
    const id = setTimeout(resetFormFields, 300);
    return () => clearTimeout(id);
  }, [isOpen]);

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      alert(t('onlyPngAllowed') || 'Sadece PNG dosyaları yüklenebilir.');
      return;
    }

    setUploading(true);
    try {
      await uploadUserAvatar(userId, file);
      alert(t('imageUploadSuccess') || 'Profil resmi güncellendi!');
      onClose();
      await onAvatarConfirmed();
    } catch (error) {
      console.error('Yükleme hatası:', error);
      alert(t('imageUploadError') || 'Yükleme başarısız.');
    } finally {
      setUploading(false);
    }
  };

  const handleReferenceSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'image/png') {
      alert('Referans resim sadece PNG formatında olabilir.');
      e.target.value = '';
      return;
    }

    setReferenceImage(file);
    setReferencePreview(URL.createObjectURL(file));
  };

  const handleGenerateImage = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    setPreviewImage(null);
    setTempAvatarId(null);

    try {
      const resData = referenceImage
        ? await editUserAvatarWithReference(userId, referenceImage, aiPrompt)
        : await generateUserAvatar(userId, aiPrompt);

      if (resData.preview_image && resData.temp_avatar_id) {
        setPreviewImage(resData.preview_image);
        setTempAvatarId(resData.temp_avatar_id);
      }
    } catch (error) {
      console.error('Generate error:', error);
      alert('Resim oluşturulamadı.');
    } finally {
      setGenerating(false);
    }
  };

  const handleConfirmAvatar = async () => {
    setConfirming(true);
    try {
      await confirmUserAvatar(userId, tempAvatarId!);
      alert('Yeni avatarınız kaydedildi!');
      onClose();
      await onAvatarConfirmed();
    } catch (error) {
      console.error('Confirm error:', error);
      alert('Hata oluştu.');
    } finally {
      setConfirming(false);
    }
  };

  const clearReference = () => {
    setReferenceImage(null);
    setReferencePreview(clearReferencePreview);
  };

  return {
    modalMode,
    setModalMode,
    uploading,
    fileInputRef,
    referenceImage,
    referencePreview,
    refInputRef,
    aiPrompt,
    setAiPrompt,
    generating,
    previewImage,
    setPreviewImage,
    tempAvatarId,
    confirming,
    handleFileUpload,
    handleReferenceSelect,
    handleGenerateImage,
    handleConfirmAvatar,
    clearReference,
  };
}
