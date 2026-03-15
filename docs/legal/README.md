# Yasal ve Sözleşme Metinleri

NeuroPDF uygulamasında kullanılan yasal metinler **uygulama kodunun bir parçası** olarak tutulur; kayıt (register) akışında EULA onayı için okunur.

---

## EULA (Kullanıcı Sözleşmesi)

| Dil | Dosya (kanonik konum) | Açıklama |
|-----|------------------------|----------|
| Türkçe | `backend/app/docs/EULA_TR.md` | Kayıt sırasında gösterilen EULA metni |
| İngilizce | `backend/app/docs/EULA_EN.md` | İngilizce EULA metni |

Bu dosyalar **taşınmamalıdır**; backend `app.utils.helpers.get_eula_content(lang)` ile bu yolu kullanır.

---

## Referans

- EULA içerikleri: `backend/app/utils/helpers.py` → `get_eula_content(lang)`
- Kayıt sayfası: `frontend/src/app/register/page.tsx` (EULA modal ve onay)
