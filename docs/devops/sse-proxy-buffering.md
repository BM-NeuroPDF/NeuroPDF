# SSE Reverse Proxy Notes

SSE akisi icin reverse proxy tarafinda response buffering kapatilmalidir.

## Nginx Ornegi

```nginx
location /files/chat/message/stream {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    chunked_transfer_encoding on;
    proxy_read_timeout 3600s;
}

location /files/summarize/stream {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    chunked_transfer_encoding on;
    proxy_read_timeout 3600s;
}
```

Ek olarak backend ve aiService stream response'larinda `X-Accel-Buffering: no` header'i set edilir.
