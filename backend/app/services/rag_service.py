"""RAG pipeline (LangChain): pgvector retrieval + grounded Gemini answer.

- Retrieval: SupabaseVectorStore (DiabAIVectorStore adapter) +
  GoogleGenerativeAIEmbeddings against the EXISTING kb_chunks table and
  match_kb_chunks RPC (schema unchanged).
- Generation: ChatGoogleGenerativeAI with GEMINI_MODEL (single model, no
  fallback) in an LCEL chain: prompt | llm | StrOutputParser().
- Contract: answer(question) -> (answer_text, sources) with sources shaped
  {index, title, excerpt, similarity} — unchanged for the API and frontend.
"""

from functools import lru_cache

from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings

from app.config import get_settings
from app.services.gemini_service import GeminiNotConfigured
from app.services.kb_vectorstore import DiabAIVectorStore
from app.services.supabase_client import get_service_client
from app.services.usage_service import GeminiUsageCallback

MATCH_COUNT = 5

SYSTEM_PROMPT = (
    "You are DiabAI, a diabetes-focused health information assistant used by "
    "doctors and patients.\n"
    "Rules:\n"
    "1. Answer ONLY from the provided context. Never invent medical facts.\n"
    "2. Cite the context you use with bracketed numbers like [1] or [2].\n"
    "3. If the context does not contain the answer, say plainly that you "
    "don't have that information in your knowledge base.\n"
    "4. You provide general information, not a diagnosis. When appropriate, "
    "encourage the user to consult a healthcare professional.\n"
    "5. Reply in the same language as the question (English or French)."
)


def _require_key() -> None:
    if not get_settings().gemini_api_key:
        raise GeminiNotConfigured()


@lru_cache
def _get_embeddings() -> GoogleGenerativeAIEmbeddings:
    _require_key()
    s = get_settings()
    # output_dimensionality must match kb_chunks.embedding vector(768)
    return GoogleGenerativeAIEmbeddings(
        model=s.gemini_embedding_model,
        google_api_key=s.gemini_api_key,
        output_dimensionality=s.embedding_dimensions,
    )


@lru_cache
def _get_store() -> DiabAIVectorStore:
    return DiabAIVectorStore(
        client=get_service_client(),
        embedding=_get_embeddings(),
        table_name="kb_chunks",
        query_name="match_kb_chunks",
    )


@lru_cache
def _get_chain():
    _require_key()
    s = get_settings()
    llm = ChatGoogleGenerativeAI(
        model=s.gemini_model,
        google_api_key=s.gemini_api_key,
        temperature=0.3,
        max_output_tokens=1024,
    )
    prompt = ChatPromptTemplate.from_messages(
        [("system", SYSTEM_PROMPT), ("human", "{input}")]
    )
    return prompt | llm | StrOutputParser()


def retrieve(question: str) -> list[dict]:
    """Top-k similar KB chunks (cosine) → [{content, title, similarity}]."""
    docs = _get_store().similarity_search(question, k=MATCH_COUNT)
    return [
        {
            "content": d.page_content,
            "title": d.metadata.get("title") or "Diabetes knowledge base",
            "similarity": float(d.metadata.get("similarity") or 0.0),
        }
        for d in docs
    ]


def answer(question: str, user_id: str | None = None) -> tuple[str, list[dict]]:
    """Returns (answer_text, sources). Sources carry [n] indices for the UI."""
    chunks = retrieve(question)

    if not chunks:
        return (
            "I don't have any documents in my knowledge base yet. "
            "Ask an administrator to run the ingestion script "
            "(backend/scripts/ingest_kb.py).",
            [],
        )

    context_blocks = []
    sources = []
    for i, c in enumerate(chunks, start=1):
        content = " ".join(str(c.get("content", "")).split())
        title = c.get("title") or "Diabetes knowledge base"
        context_blocks.append(f"[{i}] ({title}) {content}")
        sources.append(
            {
                "index": i,
                "title": title,
                "excerpt": content[:220] + ("…" if len(content) > 220 else ""),
                "similarity": round(float(c.get("similarity", 0.0)), 4),
            }
        )

    user_prompt = (
        "Context from the diabetes knowledge base:\n\n"
        + "\n\n".join(context_blocks)
        + f"\n\nQuestion: {question}\n\n"
        "Answer using the context above, citing sources as [n]:"
    )

    handler = GeminiUsageCallback(user_id=user_id, model=get_settings().gemini_model)
    text = str(
        _get_chain().invoke({"input": user_prompt}, config={"callbacks": [handler]})
    ).strip()
    if not text:
        raise RuntimeError(
            f"Gemini ({get_settings().gemini_model}) returned an empty response"
        )
    return text, sources
