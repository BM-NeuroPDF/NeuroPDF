from pathlib import Path
import logging

logger = logging.getLogger(__name__)

def get_eula_content(lang: str) -> str:
    filename = "EULA_TR.md" if lang == "tr" else "EULA_EN.md"
    # Logic to find docs folder relative to app/utils/helpers.py
    file_path = Path(__file__).resolve().parent.parent / "docs" / filename
    
    if file_path.exists():
        try:
            return file_path.read_text(encoding="utf-8")
        except Exception as e:
            logger.error(f"EULA read error: {e}")
            return "Error reading file."
    return f"EULA file {filename} not found."