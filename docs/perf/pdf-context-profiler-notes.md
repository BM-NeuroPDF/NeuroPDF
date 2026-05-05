# PDF context split — React Profiler notes

## Goal

`PdfProvider` exposes three contexts (`PdfDataContext`, `PdfUiContext`, `PdfActionsContext`). Consumers should prefer `usePdfData`, `usePdfUi`, and `usePdfActions` instead of the deprecated `usePdf()` merge, so **UI-only updates** (e.g. Pro chat open flags) do not force **data-only** subscribers to re-render from context.

## Hot path exercised

1. **ResponsivePdfPanel → `usePdfData()`**  
   Subscribes only to the data slice (`pdfList`, etc.). When `PdfUiContext` updates (e.g. `proChatOpen`) but the data memo value is unchanged, this hook does not schedule an update from that context.

2. **ProChatPanel (`memo`) → `usePdfData()`**  
   Uses only `pdfFile` from data. Panel `isOpen` still comes from props, so opening/closing the panel commits this component when props change; the important regression guard is **not** treating unrelated data churn as required work.

3. **Documents / `DocumentsClientPanel`**  
   Already used `usePdfActions` + `usePdfUi` only (no full `usePdf()`), so the documents route stays on the narrow subscription pattern.

## How to record (React DevTools Profiler)

1. Install React DevTools (Chrome/Firefox).
2. Open the app, go to a page that mounts **ResponsivePdfPanel** (e.g. `/summarize-pdf` with an authenticated session).
3. Profiler tab → **Start profiling** → perform a short scenario:
   - **A (UI-heavy):** Toggle Pro chat FAB / panel chrome if visible, or any action that flips only `PdfUiContext` without changing the active `File` or chat message arrays.
   - **B (data-heavy):** Upload or switch PDF so `pdfList` / `pdfFile` changes.
4. Stop profiling. Enable **“Highlight updates when components render”** in DevTools Settings if needed.
5. Compare commits:
   - **Before refactor (baseline):** components that called `usePdf()` subscribed to a single hook that read **all three** contexts, so any slice update re-ran that hook’s consumer logic.
   - **After refactor:** in the same UI-only scenario, **`ResponsivePdfPanel`** and other **`usePdfData`-only** trees should show **fewer redundant renders** driven purely by UI context updates (they may still render if a parent re-renders and passes new props; isolating with `memo` on those boundaries tightens further).

## Sample observation (local run)

Recorded on dev build (React 19): toggling UI-only state while **not** changing `pdfFile` showed **no additional Profiler rows** for `ResponsivePdfPanel` attributable to context (parent layout commits still occur). After switching the active PDF, `ResponsivePdfPanel` committed as expected. **Exact flame counts vary by route and session state**; capture your own trace and archive the Profiler JSON export if you need CI/manual regression artifacts.

## Follow-ups (optional)

- Wrap layout chrome that only needs `pdfList` in `React.memo` with stable props to reduce parent-driven commits.
- Gradually replace remaining `usePdf()` call sites with the split hooks (see deprecation on `usePdf`).
