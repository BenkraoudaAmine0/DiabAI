"""RAG chatbot — LangChain components orchestrated by a LangGraph graph.

    START → condense → retrieve ─┬─ (chunks found) → generate ──→ END
                                 └─ (nothing)      → no_context → END

- condense   (LangChain LCEL: prompt | Gemini | StrOutputParser) rewrites a
             follow-up ("and for type 2?") into a standalone search query
             using the conversation history. Skipped on a first question.
- retrieve   SupabaseVectorStore (DiabAIVectorStore adapter) + the
             knowledge base's embedding model (local EmbeddingGemma or
             Gemini, app/services/embeddings) against kb_chunks via the
             match_kb_chunks_v3 RPC ('ready' documents embedded by that same
             model only, page / chapter / table / figure metadata, optional
             KB_MIN_SIMILARITY floor).
- generate   LCEL chain: system rules + history + numbered context → answer
             citing [n]. Single model (GEMINI_MODEL), no fallback.
- no_context fixed reply when the knowledge base has nothing relevant — the
             model is never asked to answer without sources.

Contract: answer(question, user_id, history, lang) -> (answer_text, sources)
with sources shaped {index, title, excerpt, similarity, page, chapter,
content_type}. Token usage of every LLM call is logged (GeminiUsageCallback).
"""

import re
from functools import lru_cache
from typing import Optional, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from app.config import get_settings
from app.services import embeddings
from app.services.gemini_service import GeminiNotConfigured
from app.services.gemini_service import chat_model as get_llm
from app.services.kb_vectorstore import DiabAIVectorStore
from app.services.supabase_client import get_service_client
from app.services.usage_service import GeminiUsageCallback

MATCH_COUNT = 5
HISTORY_MESSAGES = 6  # last 3 exchanges are enough to resolve a follow-up
HISTORY_CHARS = 1500  # per message

SYSTEM_PROMPT = (
    "You are DiabAI, a diabetes-focused health information assistant used by "
    "doctors and patients.\n"
    "Rules:\n"
    "1. Answer ONLY from the context provided with the latest question. Never "
    "invent medical facts. Earlier turns are only there to understand what "
    "the user refers to.\n"
    "2. Cite the context you use with bracketed numbers like [1] or [2]. "
    "Context marked (table) or (figure) comes from a table or an image of the "
    "source document.\n"
    "3. If the context does not contain the answer, say plainly that you "
    "don't have that information in your knowledge base.\n"
    "4. You provide general information, not a diagnosis. When appropriate for patients, "
    "remind them to consult their doctor.\n"
    "5. Reply in the same language as the question (English or French).\n"
    "6. Do NOT use LaTeX math formatting (such as $\\ge$, $\\le$, $\\beta$). Use standard characters like ≥, ≤, β."
)

LATEX_REPLACEMENTS = [
    (r"\$(?:\\ge|\\geq)\$|\\(?:ge|geq)\b", "≥"),
    (r"\$(?:\\le|\\leq)\$|\\(?:le|leq)\b", "≤"),
    (r"\$\\beta\$|\\beta\b", "β"),
    (r"\$\\alpha\$|\\alpha\b", "α"),
    (r"\$\\gamma\$|\\gamma\b", "γ"),
    (r"\$\\delta\$|\\delta\b", "δ"),
    (r"\$\\pm\$|\\pm\b", "±"),
    (r"\$\\times\$|\\times\b", "×"),
    (r"\$\\approx\$|\\approx\b", "≈"),
    (r"\$\\neq\$|\\neq\b", "≠"),
    (r"\$\\mu\$|\\mu\b", "µ"),
    (r"\$(?:\\rightarrow|\\to)\$|\\(?:rightarrow|to)\b", "→"),
    (r"\$\\leftarrow\$|\\leftarrow\b", "←"),
]


def clean_latex(text: str) -> str:
    """Replaces common LaTeX math symbols with clean plain unicode characters."""
    out = text
    for pattern, repl in LATEX_REPLACEMENTS:
        out = re.sub(pattern, repl, out)
    # Remove single dollar signs wrapping plain terms/numbers like $7.0$ -> 7.0
    out = re.sub(r"\$([0-9a-zA-Z\s.,/%+-]+)\$", r"\1", out)
    return out


CONDENSE_PROMPT = (
    "You rewrite follow-up questions for a diabetes knowledge-base search. "
    "Given the conversation and the user's latest message, write ONE "
    "standalone search query that contains everything needed to understand "
    "it (resolve 'it', 'that', 'and for children?', …). Keep the language of "
    "the latest message. If it is already standalone, return it unchanged. "
    "Output only the query."
)

NO_CONTEXT = {
    "en": (
        "I couldn't find anything about this in my knowledge base. An "
        "administrator can add documents and books from the admin dashboard."
    ),
    "fr": (
        "Je n'ai rien trouvé à ce sujet dans ma base de connaissances. Un "
        "administrateur peut ajouter des documents et des livres depuis le "
        "tableau de bord d'administration."
    ),
}


class RagState(TypedDict, total=False):
    question: str
    history: list[BaseMessage]
    lang: str
    friendly: bool  # patient setting: simple, supportive wording
    patient_context: Optional[str]  # de-identified record summary (clinicians)
    search_query: str
    chunks: list[dict]
    answer: str
    sources: list[dict]


def _require_key() -> None:
    if not get_settings().gemini_api_key:
        raise GeminiNotConfigured()


@lru_cache
def get_store() -> DiabAIVectorStore:
    """Shared by retrieval here and ingestion (kb_ingest_service). The
    embedding model (local or Gemini) comes from app/services/embeddings."""
    return DiabAIVectorStore(
        client=get_service_client(),
        embedding=embeddings.get_embeddings(),
        table_name="kb_chunks",
        query_name="match_kb_chunks_v3",
    )


@lru_cache
def _condense_chain():
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", CONDENSE_PROMPT),
            MessagesPlaceholder("history"),
            ("human", "Latest message: {question}\n\nStandalone search query:"),
        ]
    )
    return prompt | get_llm(0.0, 512) | StrOutputParser()


@lru_cache
def _answer_chain():
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            MessagesPlaceholder("history"),
            ("human", "{input}"),
        ]
    )
    return prompt | get_llm(0.3, 2048) | StrOutputParser()


def retrieve(question: str) -> list[dict]:
    """Top-k similar KB chunks (cosine)
    → [{content, title, similarity, page, chapter, content_type}]."""
    threshold = get_settings().kb_min_similarity
    try:
        docs = get_store().similarity_search(
            question,
            k=MATCH_COUNT,
            score_threshold=threshold or None,
            # only documents embedded by the model that embedded the question
            filter={"embedding_model": embeddings.model_id()},
        )
    except Exception as exc:
        if "match_kb_chunks_v3" in str(exc):
            raise RuntimeError(
                "the knowledge-base search function is missing — apply "
                "backend/supabase/migrations/0009_embedding_model.sql"
            ) from exc
        raise
    chunks = []
    for d in docs:
        page = d.metadata.get("page_label") or d.metadata.get("page")
        kind = d.metadata.get("content_type")
        chunks.append(
            {
                "content": d.page_content,
                "title": d.metadata.get("title") or "Diabetes knowledge base",
                "similarity": float(d.metadata.get("similarity") or 0.0),
                "page": str(page) if page else None,
                "chapter": d.metadata.get("chapter") or None,
                "content_type": kind if kind in ("table", "figure") else None,
            }
        )
    return chunks


# ── graph nodes ──────────────────────────────────────────────────────────────
def _condense(state: RagState, config: RunnableConfig) -> RagState:
    if not state.get("history"):
        return {"search_query": state["question"]}
    query = _condense_chain().invoke(
        {"history": state["history"], "question": state["question"]}, config
    ).strip()
    return {"search_query": query or state["question"]}


def _retrieve(state: RagState) -> RagState:
    return {"chunks": retrieve(state["search_query"])}


def _route(state: RagState) -> str:
    return "generate" if state.get("chunks") else "no_context"


def _no_context(state: RagState) -> RagState:
    return {"answer": NO_CONTEXT.get(state.get("lang") or "en", NO_CONTEXT["en"]), "sources": []}


def _generate(state: RagState, config: RunnableConfig) -> RagState:
    context_blocks = []
    sources = []
    for i, c in enumerate(state["chunks"], start=1):
        # tables keep their line breaks (Markdown rows); text is flattened
        raw = str(c.get("content", ""))
        content = raw.strip() if c.get("content_type") == "table" else " ".join(raw.split())
        title = c.get("title") or "Diabetes knowledge base"
        where = ", ".join(
            part
            for part in (
                title,
                c.get("chapter"),
                f"p. {c['page']}" if c.get("page") else None,
                c.get("content_type"),
            )
            if part
        )
        context_blocks.append(f"[{i}] ({where}) {content}")
        flat = " ".join(raw.split())
        sources.append(
            {
                "index": i,
                "title": title,
                "excerpt": flat[:220] + ("…" if len(flat) > 220 else ""),
                "similarity": round(float(c.get("similarity", 0.0)), 4),
                "page": c.get("page"),
                "chapter": c.get("chapter"),
                "content_type": c.get("content_type"),
            }
        )

    user_prompt = (
        "Context from the diabetes knowledge base:\n\n"
        + "\n\n".join(context_blocks)
        + f"\n\nQuestion: {state['question']}\n\n"
        "Answer using the context above, citing sources as [n]:"
    )
    if state.get("patient_context"):
        user_prompt += (
            "\n(The clinician selected a patient record — de-identified summary: "
            f"{state['patient_context']}. Relate the answer to this patient where "
            "the sources allow it; never invent values that are not listed.)"
        )
    if state.get("friendly"):
        user_prompt += (
            "\n(Write for a patient: short sentences, everyday words, a calm "
            "and supportive tone; explain any medical term you must use.)"
        )
    text = str(
        _answer_chain().invoke(
            {"history": state.get("history") or [], "input": user_prompt}, config
        )
    ).strip()
    if not text:
        raise RuntimeError(
            f"Gemini ({get_settings().gemini_model}) returned an empty response"
        )
    return {"answer": clean_latex(text), "sources": sources}


@lru_cache
def get_graph():
    graph = StateGraph(RagState)
    graph.add_node("condense", _condense)
    graph.add_node("retrieve", _retrieve)
    graph.add_node("generate", _generate)
    graph.add_node("no_context", _no_context)
    graph.add_edge(START, "condense")
    graph.add_edge("condense", "retrieve")
    graph.add_conditional_edges(
        "retrieve", _route, {"generate": "generate", "no_context": "no_context"}
    )
    graph.add_edge("generate", END)
    graph.add_edge("no_context", END)
    return graph.compile()


def to_history(messages: list[dict]) -> list[BaseMessage]:
    """chat_messages rows (oldest first) → LangChain messages. Old [n]
    markers are dropped: they point at sources of earlier turns."""
    out: list[BaseMessage] = []
    for m in messages[-HISTORY_MESSAGES:]:
        content = str(m.get("content") or "")[:HISTORY_CHARS]
        if m.get("role") == "assistant":
            out.append(AIMessage(content=re.sub(r"\s?\[\d+\]", "", content)))
        else:
            out.append(HumanMessage(content=content))
    return out


def answer(
    question: str,
    user_id: Optional[str] = None,
    history: Optional[list[dict]] = None,
    lang: Optional[str] = None,
    friendly: bool = False,
    patient_context: Optional[str] = None,
) -> tuple[str, list[dict]]:
    """Returns (answer_text, sources). Sources carry [n] indices for the UI."""
    _require_key()
    handler = GeminiUsageCallback(user_id=user_id, model=get_settings().gemini_model)
    state = get_graph().invoke(
        {
            "question": question,
            "history": to_history(history or []),
            "lang": lang if lang in NO_CONTEXT else "en",
            "friendly": friendly,
            "patient_context": patient_context,
        },
        config={"callbacks": [handler]},
    )
    return state["answer"], state.get("sources") or []
