"""rag_service: chromadb mock ile tam dal kapsamı (ağ yok)."""

from __future__ import annotations

from unittest.mock import MagicMock


from app.services.rag_service import (
    RAGStore,
    DeterministicEmbeddingFunction,
    chunk_text,
    _text_to_vector,
)


class TestTextToVector:
    def test_zero_dimension_returns_empty(self):
        assert _text_to_vector("x", dimension=0) == []

    def test_normalization_branch(self):
        v = _text_to_vector("abc", dimension=128)
        assert len(v) == 128
        s = sum(x * x for x in v) ** 0.5
        assert abs(s - 1.0) < 1e-6


class TestDeterministicEmbeddingFunction:
    def test_embed_helper(self):
        ef = DeterministicEmbeddingFunction(dimension=16)
        v = ef._embed("test")
        assert len(v) == 16

    def test_call_batch(self):
        ef = DeterministicEmbeddingFunction(dimension=32)
        out = ef(["a", "b"])
        assert len(out) == 2 and len(out[0]) == 32


class TestRAGStoreMocked:
    def test_add_documents_generates_ids_and_metadatas(self):
        coll = MagicMock()
        client = MagicMock()
        client.get_or_create_collection.return_value = coll
        store = RAGStore(
            client=client,
            embedding_function=DeterministicEmbeddingFunction(dimension=8),
        )
        store.add_documents("c1", ["a", "b"])
        coll.add.assert_called_once()
        kwargs = coll.add.call_args.kwargs
        assert kwargs["ids"] == ["chunk_0", "chunk_1"]
        assert len(kwargs["metadatas"]) == 2

    def test_add_documents_partial_metadatas_padded(self):
        coll = MagicMock()
        client = MagicMock()
        client.get_or_create_collection.return_value = coll
        store = RAGStore(client=client)
        store.add_documents(
            "c1", ["x", "y", "z"], ids=["i1", "i2", "i3"], metadatas=[{"a": 1}]
        )
        assert len(coll.add.call_args.kwargs["metadatas"]) == 3

    def test_query_passes_where(self):
        coll = MagicMock()
        coll.query.return_value = {"documents": [[]], "distances": [[]]}
        client = MagicMock()
        client.get_or_create_collection.return_value = coll
        store = RAGStore(client=client)
        store.query("c", ["q"], n_results=3, where={"k": "v"})
        coll.query.assert_called_once_with(
            query_texts=["q"], n_results=3, where={"k": "v"}
        )

    def test_delete_collection_swallows_exception(self):
        client = MagicMock()
        client.delete_collection.side_effect = RuntimeError("boom")
        store = RAGStore(client=client)
        store.delete_collection("any")  # should not raise


def test_rag_store_none_client_imports_chromadb_via_sys_modules(monkeypatch):
    """chromadb paketi 3.14'te kırılabilir; gerçek import yerine modül enjekte edilir."""
    import types
    import sys

    fake_mod = types.ModuleType("chromadb")
    fake_client = MagicMock()
    fake_mod.EphemeralClient = MagicMock(return_value=fake_client)
    monkeypatch.setitem(sys.modules, "chromadb", fake_mod)

    from app.services.rag_service import RAGStore

    store = RAGStore(client=None)
    assert store._client is fake_client
    fake_mod.EphemeralClient.assert_called_once()


def test_chunk_text_whitespace_only():
    assert chunk_text("   \n  ") == []


def test_chunk_text_short_returns_single_strip():
    assert chunk_text("  kisa  ", chunk_size=100) == ["kisa"]


def test_chunk_text_sentence_split_and_overlap():
    # chunk_text içindeki for döngüsü ve overlap dalı (63–89)
    long = ". ".join([f"Cümle numara {i} burada." for i in range(80)])
    chunks = chunk_text(long, chunk_size=120, overlap=8)
    assert len(chunks) >= 2


def test_build_rag_store_uses_injected_chromadb(monkeypatch):
    import types
    import sys

    fake_mod = types.ModuleType("chromadb")
    fake_mod.EphemeralClient = MagicMock(return_value=MagicMock())
    monkeypatch.setitem(sys.modules, "chromadb", fake_mod)

    from app.services.rag_service import build_rag_store_for_tests

    store = build_rag_store_for_tests()
    assert store._client is not None
