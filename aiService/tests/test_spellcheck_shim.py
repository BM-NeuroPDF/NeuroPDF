def test_spellcheck_reexports_text_cleaner():
    from app.services.spellcheck_service import detect_unknown_words as d1
    from app.services.text_cleaner import detect_unknown_words as d2

    assert d1 is d2
