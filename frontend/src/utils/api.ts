import { getSession, signOut } from "next-auth/react";

// Backend Adresi
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Token expire durumunda kullanıcıyı login sayfasına yönlendir
 */
const handleTokenExpired = async () => {
  // Sadece browser ortamında çalış
  if (typeof window === "undefined") return;
  
  try {
    // NextAuth session'ını temizle ve login sayfasına yönlendir
    await signOut({ 
      callbackUrl: "/login",
      redirect: true 
    });
  } catch (error) {
    console.error("Sign out hatası:", error);
    // Fallback: Manuel yönlendirme
    window.location.href = "/login";
  }
};

export const sendRequest = async (
  endpoint: string,
  method: string = "GET",
  body: any = null,
  isFileUpload: boolean = false
) => {

  // 1. KRİTİK ADIM: Token'ı Session'dan (Cookie'den) Çek
  // getSession() fonksiyonu NextAuth cookie'sini çözer ve veriyi getirir.
  const session = await getSession();

  // route.ts dosyasında 'accessToken' olarak kaydetmiştik:
  const token = (session as any)?.accessToken;

  // Misafir ID (Hala LocalStorage'da durur, bu doğru)
  const guestId = typeof window !== "undefined" ? localStorage.getItem("guest_id") : null;

  // 2. Headerları Hazırla
  const headers: Record<string, string> = {};

  // ✅ Token varsa ekle (Backend artık 'Misafir' demeyecek)
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Misafir ID varsa ekle
  if (guestId) {
    headers["X-Guest-ID"] = guestId;
  }

  // Dosya yüklemiyorsak JSON olduğunu belirt
  if (!isFileUpload && body) {
    headers["Content-Type"] = "application/json";
  }

  // 3. İsteği Gönder
  const config: RequestInit = {
    method: method,
    headers: headers,
  };

  if (body) {
    config.body = isFileUpload ? body : JSON.stringify(body);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, config);

    if (!response.ok) {
      // ✅ Token expire kontrolü (401 Unauthorized)
      if (response.status === 401) {
        // Token expire olduğunda kullanıcıyı login sayfasına yönlendir
        await handleTokenExpired();
        // Yönlendirme yapıldıktan sonra hata fırlatma (kullanıcı zaten yönlendirildi)
        throw new Error("Oturum süreniz dolmuş. Lütfen tekrar giriş yapın.");
      }

      const errorData = await response.json().catch(() => ({}));

      let errorMessage = `Hata: ${response.status}`;
      if (errorData.detail) {
        if (Array.isArray(errorData.detail)) {
          // FastAPI Validator Error Array (422)
          errorMessage = errorData.detail.map((err: any) => err.msg).join(", ");
        } else if (typeof errorData.detail === "string") {
          errorMessage = errorData.detail;
        } else {
          errorMessage = JSON.stringify(errorData.detail);
        }
      }

      throw new Error(errorMessage);
    }

    // Yanıt tipine göre dön (JSON veya Dosya/Blob)
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return await response.json();
    } else {
      return await response.blob();
    }

  } catch (error) {
    // 401 hatası zaten handleTokenExpired ile yönetildi, tekrar loglamaya gerek yok
    if (error instanceof Error && error.message.includes("Oturum süreniz dolmuş")) {
      throw error; // Yönlendirme yapıldı, hata mesajını fırlat ama loglama
    }
    console.error("API İsteği Hatası:", error);
    throw error;
  }
};