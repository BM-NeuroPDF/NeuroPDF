# Image Guidelines (Next.js `next/image`)

## Goal
Keep LCP (Largest Contentful Paint) stable by ensuring that above-the-fold images load early, while responsive images provide correct `sizes`.

## Rules

### 1) Above-the-fold images -> use `priority`
Add `priority` when an image is visible in the initial viewport and can be an LCP candidate.

Typical examples:
- page-level logo/hero images on `/`
- other large, immediately visible "hero" visuals

### 2) Responsive images -> use `sizes`
Add `sizes` when the rendered width depends on the viewport.

Typical examples:
- `fill` images
- `w-full`, `max-w-*`, or similar styles where the final rendered width is not a fixed pixel value

If the image is a fixed-size icon (width/height props match the final rendered size), do not add `sizes`.

### 3) Avoid width/height mismatch
Do not use CSS classes/styles that change the rendered `width` or `height` in a way that conflicts with the `width`/`height` props.

If you need to scale with CSS, update `width`/`height` to match the CSS-rendered size.

## Quick examples

### Above-the-fold
```tsx
<Image src="/logo.png" alt="Logo" width={200} height={60} priority />
```

### Responsive
```tsx
<Image
  src="/hero.png"
  alt="Hero"
  fill
  sizes="(max-width: 768px) 90vw, 50vw"
/>
```

