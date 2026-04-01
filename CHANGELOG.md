# Changelog

All notable changes to this project are documented in this file.

## [Unreleased] - 2026-03-31

### Added
- Frontend testleri ve UI için `pdf-lib`, `sonner`, `@testing-library/user-event`, `msw` paketleri eklendi.

### Fixed
- Vitest ortamında `react-pdf`, `Audio.play()` ve `PopupContext` mock eksiklikleri giderildi.
- Pytest tarafında Auth (Avatar) ve Storage (`Path.mkdir`) testleri mock yapılarına uygun hale getirildi.

### Changed
- Ruff bağımlılığı npm yerine doğrudan Python (`python -m pip install ruff`) üzerinden çalışacak şekilde revize edildi.
