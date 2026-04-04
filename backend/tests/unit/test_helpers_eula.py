"""helpers.get_eula_content — Path zinciri (utils → app → docs / dosya)."""

from unittest.mock import patch

import app.utils.helpers as helpers


class _Leaf:
    def __init__(self, exists=True, read_ok=True):
        self._exists = exists
        self._read_ok = read_ok

    def exists(self):
        return self._exists

    def read_text(self, encoding="utf-8"):
        if not self._read_ok:
            raise OSError("simulated")
        return "EULA"


class _Docs:
    def __truediv__(self, other):
        return _Leaf(exists=True, read_ok=False)


class _App:
    def __truediv__(self, other):
        if other == "docs":
            return _Docs()
        return _Leaf(exists=False)


class _Utils:
    @property
    def parent(self):
        return _App()


class _HelpersFile:
    def __init__(self, *a, **k):
        pass

    def resolve(self):
        return self

    @property
    def parent(self):
        return _Utils()


def test_get_eula_read_error():
    with patch.object(helpers, "Path", _HelpersFile):
        out = helpers.get_eula_content("tr")
        assert "Error" in out


def test_get_eula_not_found():
    class _Docs2:
        def __truediv__(self, other):
            return _Leaf(exists=False, read_ok=False)

    class _App2:
        def __truediv__(self, other):
            if other == "docs":
                return _Docs2()
            return _Leaf(exists=False, read_ok=False)

    class _Utils2:
        @property
        def parent(self):
            return _App2()

    class _H2:
        def __init__(self, *a, **k):
            pass

        def resolve(self):
            return self

        @property
        def parent(self):
            return _Utils2()

    with patch.object(helpers, "Path", _H2):
        out = helpers.get_eula_content("en")
        assert "not found" in out.lower()
