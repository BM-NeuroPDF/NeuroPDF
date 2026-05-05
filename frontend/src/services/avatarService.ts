import { sendRequest } from '@/utils/api';

export type AvatarGenerateResponse = {
  preview_image?: string;
  temp_avatar_id?: string;
};

export async function uploadUserAvatar(userId: string, file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);
  return sendRequest<unknown>(`/api/v1/user/${userId}/avatar`, 'POST', formData, true);
}

export async function generateUserAvatar(
  userId: string,
  prompt: string,
): Promise<AvatarGenerateResponse> {
  return sendRequest<AvatarGenerateResponse>(`/api/v1/user/${userId}/avatar/generate`, 'POST', {
    prompt,
  });
}

export async function editUserAvatarWithReference(
  userId: string,
  referencePng: File,
  prompt: string,
): Promise<AvatarGenerateResponse> {
  const formData = new FormData();
  formData.append('file', referencePng);
  formData.append('prompt', prompt);
  return sendRequest<AvatarGenerateResponse>(
    `/api/v1/user/${userId}/avatar/edit`,
    'POST',
    formData,
    true,
  );
}

export async function confirmUserAvatar(userId: string, tempAvatarId: string): Promise<unknown> {
  return sendRequest<unknown>(`/api/v1/user/${userId}/avatar/confirm`, 'POST', {
    temp_avatar_id: tempAvatarId,
  });
}
