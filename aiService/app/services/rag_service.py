# app/services/rag_service.py
"""
RAG (Retrieval-Augmented Generation) service using ChromaDB.
Stores PDF/document chunks with embeddings and supports similarity search.

chromadb yalnızca RAGStore / build_rag_store_for_tests kullanıldığında import edilir;
chunk_text ve deterministik embedding testleri chromadb olmadan çalışabilir.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any, Optional

# Default embedding dimension (ChromaDB compatible)
DEFAULT_EMBEDDING_DIM = 384

# Chunking defaults
DEFAULT_CHUNK_SIZE = 512
DEFAULT_CHUNK_OVERLAP = 64


class DeterministicEmbeddingFunction:
    """
    Deterministic embedding for tests and offline use.
    Same text always produces the same vector; similar texts produce similar vectors
    (by sharing hash prefixes). No API cost.
    ChromaDB embedding_function arayüzüyle uyumlu callable.
    """

    def __init__(self, dimension: int = DEFAULT_EMBEDDING_DIM):
        self.dimension = dimension

    def __call__(self, input: list[str]) -> list[list[float]]:  # noqa: A002
        return [_text_to_vector(t, self.dimension) for t in input]

    def _embed(self, text: str) -> list[float]:
        return _text_to_vector(text, self.dimension)


def _text_to_vector(text: str, dimension: int = DEFAULT_EMBEDDING_DIM) -> list[float]:
    """Turn text into a deterministic fixed-size vector (normalized)."""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    # Use bytes to fill dimension; repeat if needed
    values = []
    for i in range(dimension):
        values.append((h[(i % len(h))] - 128) / 128.0)
    # Simple normalization so magnitude is ~1
    total = sum(x * x for x in values) ** 0.5
    if total > 0:
        values = [x / total for x in values]
    return values


def chunk_text(
    text: str,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
    overlap: int = DEFAULT_CHUNK_OVERLAP,
) -> list[str]:
    """
    Split text into overlapping chunks (by character, sentence-aware when possible).
    """
    if not text or not text.strip():
        return []
    text = text.strip()
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    # Prefer splitting on sentence boundaries
    sentences = re.split(r"(?<=[.!?\n])\s+", text)
    current = []
    current_len = 0

    for sent in sentences:
        sent_len = len(sent) + 1
        if current_len + sent_len > chunk_size and current:
            chunk = " ".join(current)
            chunks.append(chunk)
            # Overlap: keep last few words
            overlap_words = chunk.split()[-overlap:] if overlap else []
            current = overlap_words
            current_len = sum(len(w) + 1 for w in current)
        current.append(sent)
        current_len += sent_len

    if current:
        chunks.append(" ".join(current))
    return chunks


class RAGStore:
    """
    ChromaDB-backed store for document chunks and similarity search.
    """

    def __init__(
        self,
        client: Optional[Any] = None,
        embedding_function: Optional[Any] = None,
    ):
        if client is None:
            import chromadb  # noqa: PLC0415

            self._client = chromadb.EphemeralClient()
        else:
            self._client = client
        self._embedding_function = (
            embedding_function or DeterministicEmbeddingFunction()
        )

    def get_or_create_collection(self, name: str):
        return self._client.get_or_create_collection(
            name=name,
            embedding_function=self._embedding_function,
        )

    def add_documents(
        self,
        collection_name: str,
        documents: list[str],
        ids: Optional[list[str]] = None,
        metadatas: Optional[list[dict]] = None,
    ) -> None:
        """Add document chunks to a collection."""
        coll = self.get_or_create_collection(collection_name)
        if ids is None:
            ids = [f"chunk_{i}" for i in range(len(documents))]
        if metadatas is None:
            metadatas = [{}] * len(documents)
        if len(metadatas) < len(documents):
            metadatas = metadatas + [{}] * (len(documents) - len(metadatas))
        coll.add(documents=documents, ids=ids, metadatas=metadatas)

    def query(
        self,
        collection_name: str,
        query_texts: list[str],
        n_results: int = 5,
        where: Optional[dict] = None,
    ) -> dict[str, Any]:
        """
        Similarity search. Returns dict with 'documents', 'metadatas', 'distances'.
        """
        coll = self.get_or_create_collection(collection_name)
        result = coll.query(
            query_texts=query_texts,
            n_results=n_results,
            where=where,
        )
        return result

    def delete_collection(self, name: str) -> None:
        """Remove collection (for tests)."""
        try:
            self._client.delete_collection(name)
        except Exception:
            pass


def build_rag_store_for_tests() -> RAGStore:
    """In-memory RAG store with deterministic embeddings (no API)."""
    import chromadb  # noqa: PLC0415

    return RAGStore(
        client=chromadb.EphemeralClient(),
        embedding_function=DeterministicEmbeddingFunction(),
    )
