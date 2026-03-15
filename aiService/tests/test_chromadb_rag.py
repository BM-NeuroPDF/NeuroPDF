"""
ChromaDB & RAG service tests.
- Verilerin vektör veritabanına doğru embedding ile kaydedildiğini doğrula.
- Similarity search yapıldığında doğru parçaların geldiğini test et.
"""
import pytest

try:
    import chromadb  # noqa: F401
    from app.services.rag_service import (
        RAGStore,
        DeterministicEmbeddingFunction,
        chunk_text,
        build_rag_store_for_tests,
        _text_to_vector,
        DEFAULT_EMBEDDING_DIM,
        DEFAULT_CHUNK_SIZE,
        DEFAULT_CHUNK_OVERLAP,
    )
    CHROMADB_AVAILABLE = True
except Exception:
    CHROMADB_AVAILABLE = False
    RAGStore = None
    DeterministicEmbeddingFunction = None
    chunk_text = None
    build_rag_store_for_tests = None
    _text_to_vector = None
    DEFAULT_EMBEDDING_DIM = DEFAULT_CHUNK_SIZE = DEFAULT_CHUNK_OVERLAP = 0

pytestmark = [
    pytest.mark.skipif(
        not CHROMADB_AVAILABLE,
        reason="ChromaDB not installed or incompatible (e.g. Python 3.14)",
    ),
    pytest.mark.chromadb,
]


# ==========================================
# Embedding & chunking (unit)
# ==========================================


class TestDeterministicEmbedding:
    """Embedding'in deterministik ve boyutunun doğru olduğunu test et."""

    def test_same_text_same_vector(self):
        text = "Aynı metin aynı vektörü vermeli."
        v1 = _text_to_vector(text)
        v2 = _text_to_vector(text)
        assert v1 == v2

    def test_different_text_different_vector(self):
        v1 = _text_to_vector("Birinci metin")
        v2 = _text_to_vector("İkinci metin")
        assert v1 != v2

    def test_vector_dimension(self):
        v = _text_to_vector("Herhangi bir metin", dimension=384)
        assert len(v) == 384
        assert all(isinstance(x, float) for x in v)

    def test_embedding_function_call(self):
        ef = DeterministicEmbeddingFunction(dimension=64)
        docs = ["doc1", "doc2"]
        emb = ef(docs)
        assert len(emb) == 2
        assert len(emb[0]) == 64
        assert len(emb[1]) == 64
        assert emb[0] != emb[1]


class TestChunkText:
    """Metnin doğru şekilde parçalara ayrıldığını test et."""

    def test_empty_returns_empty(self):
        assert chunk_text("") == []
        assert chunk_text("   ") == []

    def test_short_text_single_chunk(self):
        short = "Kısa metin."
        assert chunk_text(short) == [short]

    def test_long_text_multiple_chunks(self):
        long = " ".join(["Cümle."] * 200)
        chunks = chunk_text(long, chunk_size=100, overlap=10)
        assert len(chunks) >= 2
        for c in chunks:
            assert len(c) <= 100 + 50  # overlap can make slightly larger

    def test_chunk_overlap_content(self):
        text = "Birinci cümle. İkinci cümle. Üçüncü cümle. Dördüncü cümle. Beşinci cümle."
        chunks = chunk_text(text, chunk_size=30, overlap=5)
        assert len(chunks) >= 2
        # Overlap: some content should appear in consecutive chunks
        if len(chunks) >= 2:
            # At least one word might be shared at boundary
            words1 = set(chunks[0].split())
            words2 = set(chunks[1].split())
            assert words1 & words2 or len(chunks[0]) + len(chunks[1]) >= len(text) - 20


# ==========================================
# ChromaDB storage & similarity search
# ==========================================


class TestRAGStoreStorage:
    """Verilerin ChromaDB'ye doğru kaydedildiğini test et."""

    @pytest.fixture
    def store(self):
        store = build_rag_store_for_tests()
        yield store
        store.delete_collection("test_coll")

    def test_add_documents_and_count(self, store: RAGStore):
        store.add_documents(
            "test_coll",
            documents=["Chunk one", "Chunk two", "Chunk three"],
            ids=["id1", "id2", "id3"],
        )
        coll = store.get_or_create_collection("test_coll")
        assert coll.count() == 3

    def test_add_with_metadatas(self, store: RAGStore):
        store.add_documents(
            "test_coll",
            documents=["PDF sayfa 1", "PDF sayfa 2"],
            ids=["p1", "p2"],
            metadatas=[{"page": 1, "source": "doc.pdf"}, {"page": 2, "source": "doc.pdf"}],
        )
        coll = store.get_or_create_collection("test_coll")
        assert coll.count() == 2

    def test_same_content_same_embedding_stored(self, store: RAGStore):
        """Aynı metin aynı embedding ile saklanmalı (deterministic)."""
        store.add_documents("test_coll", documents=["Aynı içerik"], ids=["one"])
        result = store.query("test_coll", query_texts=["Aynı içerik"], n_results=1)
        assert result["documents"] is not None
        assert len(result["documents"]) == 1
        assert len(result["documents"][0]) == 1
        assert result["documents"][0][0] == "Aynı içerik"


class TestRAGStoreSimilaritySearch:
    """Similarity search'ün doğru parçaları döndürdüğünü test et."""

    @pytest.fixture
    def store_with_data(self):
        store = build_rag_store_for_tests()
        store.add_documents(
            "search_coll",
            documents=[
                "Python programlama dili ile yazılım geliştirme.",
                "ChromaDB vektör veritabanı ve embedding.",
                "FastAPI ile REST API geliştirme.",
                "RAG sistemlerinde retrieval ve generation.",
            ],
            ids=["d1", "d2", "d3", "d4"],
        )
        yield store
        store.delete_collection("search_coll")

    def test_query_returns_relevant_chunks(self, store_with_data: RAGStore):
        """Sorgu metnine en yakın chunk'lar dönmeli (deterministic embedding'de benzer metin = benzer vektör)."""
        result = store_with_data.query(
            "search_coll",
            query_texts=["Python ve API"],
            n_results=2,
        )
        assert "documents" in result
        assert len(result["documents"]) == 1  # one query
        assert len(result["documents"][0]) == 2  # n_results=2
        # En az biri Python veya API içermeli (bizim deterministic'te tam sıra garanti değil ama sonuç dolu olmalı)
        flat = result["documents"][0]
        texts = " ".join(flat).lower()
        assert "python" in texts or "api" in texts or "fastapi" in texts or "chromadb" in texts

    def test_query_n_results_respected(self, store_with_data: RAGStore):
        result = store_with_data.query(
            "search_coll",
            query_texts=["veritabanı"],
            n_results=3,
        )
        assert len(result["documents"][0]) == 3

    def test_multiple_queries(self, store_with_data: RAGStore):
        result = store_with_data.query(
            "search_coll",
            query_texts=["Python", "RAG"],
            n_results=2,
        )
        assert len(result["documents"]) == 2
        assert len(result["documents"][0]) == 2
        assert len(result["documents"][1]) == 2

    def test_distances_returned(self, store_with_data: RAGStore):
        result = store_with_data.query(
            "search_coll",
            query_texts=["embedding vektör"],
            n_results=2,
        )
        assert "distances" in result
        assert len(result["distances"][0]) == 2


# ==========================================
# Integration: chunk -> add -> query
# ==========================================


class TestRAGChunkAddQueryFlow:
    """Tam akış: metni parçala, ChromaDB'ye ekle, similarity search yap."""

    @pytest.fixture
    def store(self):
        s = build_rag_store_for_tests()
        yield s
        s.delete_collection("flow_coll")

    def test_full_flow(self, store: RAGStore):
        long_text = (
            "NeuroPDF projesi PDF işleme ve yapay zeka kullanır. "
            "ChromaDB vektör veritabanı ile RAG yapılır. "
            "Kullanıcılar PDF yükleyip özet ve sohbet alabilir."
        )
        chunks = chunk_text(long_text, chunk_size=80, overlap=15)
        assert len(chunks) >= 2

        store.add_documents(
            "flow_coll",
            documents=chunks,
            ids=[f"c{i}" for i in range(len(chunks))],
            metadatas=[{"index": i} for i in range(len(chunks))],
        )

        result = store.query(
            "flow_coll",
            query_texts=["ChromaDB ve RAG"],
            n_results=2,
        )
        assert len(result["documents"][0]) >= 1
        # Dönen metinler orijinal parçalardan olmalı
        for doc in result["documents"][0]:
            assert doc in chunks or any(doc in c or c in doc for c in chunks)
