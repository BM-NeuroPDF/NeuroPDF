"""Chat-related service helpers for files router."""

import uuid


def normalize_message_metadata(
    raw: object,
    *,
    fallback_content: str,
    fallback_language: str,
) -> dict:
    """Normalize metadata shape persisted for chat turns."""
    metadata: dict = raw.copy() if isinstance(raw, dict) else {}
    message_id = str(metadata.get("id") or uuid.uuid4())
    source_language = str(
        metadata.get("sourceLanguage")
        or metadata.get("source_language")
        or fallback_language
        or "tr"
    ).lower()
    translations_raw = metadata.get("translations")
    translations = translations_raw if isinstance(translations_raw, dict) else {}
    if not translations.get(source_language):
        translations[source_language] = fallback_content
    metadata["id"] = message_id
    metadata["sourceLanguage"] = source_language
    metadata["translations"] = translations
    return metadata
