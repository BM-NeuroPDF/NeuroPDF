# WebKit libjpeg.so.8 Fix (Fedora)

WebKit (Safari) testlerinin çalışması için sistem seviyesinde bir sembolik link oluşturulması gerekiyor.

## Manuel Kurulum (Önerilen)

```bash
sudo ln -sf /usr/lib64/libjpeg.so.62 /usr/lib64/libjpeg.so.8
```

Bu komut, sistemdeki `libjpeg.so.62` dosyasını `libjpeg.so.8` olarak sembolik link oluşturur.

## Doğrulama

```bash
ls -la /usr/lib64/libjpeg.so.8
```

Çıktı şu şekilde olmalı:
```
lrwxrwxrwx. 1 root root 17 [tarih] /usr/lib64/libjpeg.so.8 -> libjpeg.so.62
```

## Alternatif: LD_LIBRARY_PATH (Geçici Çözüm)

Eğer sudo erişiminiz yoksa, testleri çalıştırırken şu şekilde çalıştırabilirsiniz:

```bash
LD_LIBRARY_PATH=/usr/lib64:$LD_LIBRARY_PATH npm run test:e2e:webkit
```

Ancak bu yöntem her seferinde manuel olarak yapılması gerektiği için önerilmez.

## Not

Bu fix, Fedora sistemlerinde WebKit'in eski libjpeg versiyonunu aramasından kaynaklanmaktadır. Sistemdeki güncel libjpeg.so.62 dosyası ile uyumlu çalışması için sembolik link gereklidir.
